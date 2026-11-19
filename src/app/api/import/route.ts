import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { ValidationError } from "@/lib/services/collaborator-service";
import {
  buildImportPreview,
  commitImport,
  generateTemplateCsv,
  generateTemplateXlsx,
  parseSpreadsheetBuffer,
} from "@/lib/services/import-service";
import type { ImportColumnMapping } from "@/types/inventory";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MAPPING_KEYS = [
  "sku",
  "name",
  "category",
  "weightGrams",
  "unit",
  "supplier",
  "minStock",
  "currentStock",
] as const;

function sanitizeMapping(raw: unknown): Partial<ImportColumnMapping> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const cleaned: Partial<ImportColumnMapping> = {};
  for (const key of ALLOWED_MAPPING_KEYS) {
    const val = record[key];
    if (typeof val === "string" || val === null) {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const template = request.nextUrl.searchParams.get("template") ?? "xlsx";
    if (template === "csv") {
      const csv = generateTemplateCsv();
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="modelo-importacao-estoque.csv"',
          "Cache-Control": "no-store",
        },
      });
    }

    const buffer = await generateTemplateXlsx();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="modelo-importacao-estoque.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new ValidationError("Selecione uma planilha .xlsx ou .csv para importar.");
      }
      if (file.size === 0) {
        throw new ValidationError("O arquivo enviado está vazio.");
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new ValidationError("O arquivo excede o limite máximo de 10 MB.");
      }

      const rawMapping = formData.get("mapping");
      let customMapping: Partial<ImportColumnMapping> | undefined;
      if (typeof rawMapping === "string" && rawMapping.trim().length > 0) {
        customMapping = sanitizeMapping(JSON.parse(rawMapping));
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const { headers, rows } = await parseSpreadsheetBuffer(buffer, file.name);
      const preview = await buildImportPreview(file.name, headers, rows, customMapping);
      return NextResponse.json(preview);
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (body?.action === "reparse") {
      const fileName = String(body.fileName ?? "planilha.xlsx");
      const headers = Array.isArray(body.headers) ? (body.headers as string[]) : [];
      const rawRows = Array.isArray(body.rawRows)
        ? (body.rawRows as Record<string, string>[]).slice(0, 5000)
        : [];
      const mapping = sanitizeMapping(body.mapping);
      const preview = await buildImportPreview(fileName, headers, rawRows, mapping);
      return NextResponse.json(preview);
    }

    const result = await commitImport(body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
