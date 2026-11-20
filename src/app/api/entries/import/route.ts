import { NextRequest, NextResponse } from "next/server";
import { requireManagerActor } from "@/app/api/_lib/actor-auth";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { ValidationError } from "@/lib/services/collaborator-service";
import {
  buildEntryOrderImportPreview,
  parseSpreadsheetBuffer,
} from "@/lib/services/import-service";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireManagerActor(request);
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new ValidationError("Selecione uma planilha .xlsx ou .csv do pedido.");
      }
      if (file.size === 0) {
        throw new ValidationError("O arquivo enviado está vazio.");
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new ValidationError("O arquivo excede o limite máximo de 10 MB.");
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const { headers, rows } = await parseSpreadsheetBuffer(buffer, file.name);
      const preview = await buildEntryOrderImportPreview(file.name, headers, rows);
      return NextResponse.json(preview);
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (body?.action === "reparse") {
      const fileName = String(body.fileName ?? "pedido.xlsx");
      const headers = Array.isArray(body.headers) ? (body.headers as string[]) : [];
      const rawRows = Array.isArray(body.rawRows)
        ? (body.rawRows as Record<string, string>[]).slice(0, 5000)
        : [];
      const preview = await buildEntryOrderImportPreview(fileName, headers, rawRows, {
        codeCol: typeof body.codeCol === "string" || body.codeCol === null ? body.codeCol : undefined,
        modelCol:
          typeof body.modelCol === "string" || body.modelCol === null ? body.modelCol : undefined,
        qtyCol: typeof body.qtyCol === "string" || body.qtyCol === null ? body.qtyCol : undefined,
      });
      return NextResponse.json(preview);
    }

    throw new ValidationError("Envie o arquivo via multipart/form-data ou ação 'reparse'.");
  } catch (err) {
    return apiErrorResponse(err);
  }
}
