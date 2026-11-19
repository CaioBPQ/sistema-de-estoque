import ExcelJS from "exceljs";
import { ensureSqliteReady, prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/services/collaborator-service";
import { withSqliteRetry } from "@/lib/services/inventory-service";
import { importCommitSchema, normalizeSku, roundQuantity } from "@/lib/validators";
import type {
  ImportColumnKey,
  ImportColumnMapping,
  ImportCommitResult,
  ImportPreviewResponse,
  ImportPreviewRow,
} from "@/types/inventory";

const MAX_IMPORT_ROWS = 5000;

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const COLUMN_ALIASES: Record<ImportColumnKey, string[]> = {
  sku: ["sku", "codigo", "cod", "codigo interno", "ref", "referencia", "id"],
  name: ["nome", "produto", "descricao", "item", "material", "nome do produto"],
  category: ["categoria", "grupo", "familia", "tipo"],
  unit: ["unidade", "un", "und", "um", "unidade de medida", "medida"],
  supplier: ["fornecedor", "fabricante", "marca", "distribuidor"],
  minStock: ["estoque minimo", "minimo", "qtd minima", "alerta", "estoque alerta", "min"],
  currentStock: [
    "saldo atual",
    "quantidade",
    "saldo",
    "estoque atual",
    "estoque",
    "qtd",
    "qtde",
    "disponivel",
  ],
};

export function suggestColumnMapping(headers: string[]): ImportColumnMapping {
  const mapping: ImportColumnMapping = {
    sku: null,
    name: null,
    category: null,
    unit: null,
    supplier: null,
    minStock: null,
    currentStock: null,
  };

  const normalizedHeaders = headers.map((h) => ({
    original: h,
    normalized: normalizeHeader(h),
  }));

  (Object.keys(COLUMN_ALIASES) as ImportColumnKey[]).forEach((key) => {
    const aliases = COLUMN_ALIASES[key];
    const exact = normalizedHeaders.find((h) => aliases.includes(h.normalized));
    if (exact) {
      mapping[key] = exact.original;
      return;
    }
    const partial = normalizedHeaders.find((h) =>
      aliases.some((alias) => alias.length >= 3 && h.normalized.includes(alias))
    );
    if (partial) {
      mapping[key] = partial.original;
    }
  });

  return mapping;
}

/**
 * Parses numbers in PT-BR (e.g. "1.250,50") or EN-US (e.g. "1250.50") formats.
 */
export function parseLocaleNumber(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  let normalized = trimmed.replace(/\s+/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return roundQuantity(parsed);
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvText(rawText: string): { headers: string[]; rows: Record<string, string>[] } {
  const cleanText = rawText.replace(/^\uFEFF/, "");
  const lines = cleanText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new ValidationError("O arquivo CSV está vazio.");
  }

  const headerLine = lines[0];
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const delimiter = semicolonCount >= commaCount ? ";" : ",";

  const rawHeaders = splitCsvLine(headerLine, delimiter);
  const headers = rawHeaders.map((h, idx) => h || `Coluna_${idx + 1}`);

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length && rows.length < MAX_IMPORT_ROWS; i += 1) {
    const values = splitCsvLine(lines[i], delimiter);
    if (values.every((v) => v === "")) continue;
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] ?? "";
    });
    rows.push(record);
  }

  return { headers, rows };
}

function cellValueToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) {
      return String(value.result).trim();
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return String(value).trim();
}

async function parseXlsxBuffer(
  buffer: Buffer
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const workbook = new ExcelJS.Workbook();
  // @ts-expect-error ExcelJS load typing differs across Node Buffer generic declarations
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) {
    throw new ValidationError("A planilha Excel não contém abas ou linhas preenchidas.");
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  const colCount = Math.max(headerRow.cellCount, headerRow.actualCellCount);

  for (let c = 1; c <= colCount; c += 1) {
    const label = cellValueToString(headerRow.getCell(c).value);
    if (label) {
      headers.push(label);
    } else {
      headers.push(`Coluna_${c}`);
    }
  }

  if (headers.length === 0) {
    throw new ValidationError("Não foi possível identificar o cabeçalho na linha 1 da planilha.");
  }

  const rows: Record<string, string>[] = [];
  for (let r = 2; r <= worksheet.rowCount && rows.length < MAX_IMPORT_ROWS; r += 1) {
    const row = worksheet.getRow(r);
    const record: Record<string, string> = {};
    let hasContent = false;

    for (let c = 1; c <= headers.length; c += 1) {
      const text = cellValueToString(row.getCell(c).value);
      if (text !== "") hasContent = true;
      record[headers[c - 1]] = text;
    }

    if (hasContent) {
      rows.push(record);
    }
  }

  return { headers, rows };
}

export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xls")) {
    throw new ValidationError(
      "Formato .xls legado não é suportado. Salve a planilha como .xlsx ou .csv no Excel."
    );
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    return parseCsvText(buffer.toString("utf-8"));
  }
  if (lower.endsWith(".xlsx")) {
    return parseXlsxBuffer(buffer);
  }
  throw new ValidationError("Formato de arquivo não suportado. Envie um arquivo .xlsx ou .csv.");
}

export async function buildImportPreview(
  fileName: string,
  headers: string[],
  rawRows: Record<string, string>[],
  customMapping?: Partial<ImportColumnMapping>
): Promise<ImportPreviewResponse> {
  await ensureSqliteReady();

  const suggestedMapping = {
    ...suggestColumnMapping(headers),
    ...customMapping,
  };

  const existingProducts = await prisma.product.findMany({
    select: { sku: true, currentStock: true },
  });
  const existingMap = new Map(
    existingProducts.map((p) => [p.sku.toUpperCase(), roundQuantity(p.currentStock)])
  );

  const seenSkusInFile = new Map<string, number>();
  const previewRows: ImportPreviewRow[] = rawRows.map((raw, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];

    const getVal = (key: ImportColumnKey): string => {
      const column = suggestedMapping[key];
      return column ? (raw[column] ?? "").trim() : "";
    };

    const rawSku = getVal("sku");
    const sku = rawSku ? normalizeSku(rawSku) : "";
    const name = getVal("name");
    const category = getVal("category") || "Geral";
    const unit = getVal("unit") || "un";
    const supplierVal = getVal("supplier");
    const supplier = supplierVal.length > 0 ? supplierVal : null;

    const minStockParsed = parseLocaleNumber(getVal("minStock"));
    const currentStockParsed = parseLocaleNumber(getVal("currentStock"));

    if (!sku) {
      errors.push("SKU/Código obrigatório");
    } else {
      const previousRow = seenSkusInFile.get(sku);
      if (previousRow !== undefined) {
        errors.push(`SKU duplicado nesta planilha (já aparece na linha ${previousRow})`);
      } else {
        seenSkusInFile.set(sku, rowNumber);
      }
    }

    if (!name) {
      errors.push("Nome do produto obrigatório");
    }

    if (minStockParsed === null || minStockParsed < 0) {
      errors.push("Estoque mínimo inválido");
    }

    if (currentStockParsed === null || currentStockParsed < 0) {
      errors.push("Saldo atual inválido");
    }

    const existingStock = sku && existingMap.has(sku) ? existingMap.get(sku)! : null;

    return {
      rowNumber,
      sku,
      name,
      category,
      unit,
      supplier,
      minStock: minStockParsed !== null && minStockParsed >= 0 ? minStockParsed : 0,
      currentStock: currentStockParsed !== null && currentStockParsed >= 0 ? currentStockParsed : 0,
      existsInDb: existingStock !== null,
      existingStock,
      errors,
    };
  });

  const errorCount = previewRows.filter((r) => r.errors.length > 0).length;
  const validRows = previewRows.filter((r) => r.errors.length === 0);
  const existingCount = validRows.filter((r) => r.existsInDb).length;
  const newCount = validRows.length - existingCount;

  return {
    fileName,
    headers,
    suggestedMapping,
    rawRowCount: rawRows.length,
    rawRows,
    previewRows,
    validCount: validRows.length,
    errorCount,
    newCount,
    existingCount,
  };
}

export async function commitImport(input: unknown): Promise<ImportCommitResult> {
  await ensureSqliteReady();
  const parsed = importCommitSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Payload de importação inválido");
  }

  const { rows, strategy, collaboratorId } = parsed.data;

  // Reject duplicate SKUs within the submitted payload
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.sku)) {
      throw new ValidationError(`SKU duplicado no lote de importação: ${row.sku}`);
    }
    seen.add(row.sku);
  }

  return withSqliteRetry(() =>
    prisma.$transaction(
      async (tx) => {
        if (collaboratorId) {
          const collab = await tx.collaborator.findUnique({ where: { id: collaboratorId } });
          if (!collab || !collab.active) {
            throw new ValidationError("Colaborador selecionado para a importação é inválido.");
          }
        }

        const existingProducts = await tx.product.findMany({
          where: { sku: { in: rows.map((r) => r.sku) } },
        });
        const existingMap = new Map(existingProducts.map((p) => [p.sku, p]));

        let created = 0;
        let updated = 0;
        let skipped = 0;
        let movementsLogged = 0;

        for (const row of rows) {
          const existing = existingMap.get(row.sku);

          if (!existing) {
            const product = await tx.product.create({
              data: {
                sku: row.sku,
                name: row.name,
                category: row.category,
                unit: row.unit,
                supplier: row.supplier ?? null,
                minStock: row.minStock,
                currentStock: row.currentStock,
              },
            });
            created += 1;

            if (row.currentStock > 0) {
              await tx.stockMovement.create({
                data: {
                  type: "IMPORT",
                  quantity: row.currentStock,
                  previousStock: 0,
                  newStock: row.currentStock,
                  reason: "Importação inicial via planilha",
                  productId: product.id,
                  collaboratorId: collaboratorId ?? null,
                },
              });
              movementsLogged += 1;
            }
            continue;
          }

          if (strategy === "SKIP") {
            skipped += 1;
            continue;
          }

          const oldStock = roundQuantity(existing.currentStock);
          const nextStock =
            strategy === "ADD_STOCK"
              ? roundQuantity(oldStock + row.currentStock)
              : roundQuantity(row.currentStock);

          await tx.product.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              category: row.category,
              unit: row.unit,
              supplier: row.supplier ?? existing.supplier,
              minStock: row.minStock,
              currentStock: nextStock,
              active: true,
            },
          });
          updated += 1;

          const delta = roundQuantity(Math.abs(nextStock - oldStock));
          if (delta > 0) {
            await tx.stockMovement.create({
              data: {
                type: "IMPORT",
                quantity: delta,
                previousStock: oldStock,
                newStock: nextStock,
                reason:
                  strategy === "ADD_STOCK"
                    ? "Soma de saldo via importação"
                    : "Substituição de saldo via importação",
                productId: existing.id,
                collaboratorId: collaboratorId ?? null,
              },
            });
            movementsLogged += 1;
          }
        }

        return { created, updated, skipped, movementsLogged };
      },
      { timeout: 20000 }
    )
  );
}

export async function generateTemplateXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Produtos");

  sheet.columns = [
    { header: "SKU", key: "sku", width: 18 },
    { header: "Nome", key: "name", width: 38 },
    { header: "Categoria", key: "category", width: 18 },
    { header: "Unidade", key: "unit", width: 12 },
    { header: "Fornecedor", key: "supplier", width: 26 },
    { header: "Estoque Minimo", key: "minStock", width: 16 },
    { header: "Saldo Atual", key: "currentStock", width: 15 },
  ];

  sheet.getRow(1).font = { bold: true };

  sheet.addRows([
    {
      sku: "EPI-CAP-001",
      name: "Capacete de Segurança Branco",
      category: "EPIs",
      unit: "un",
      supplier: "SegurPro Distribuidora",
      minStock: 10,
      currentStock: 25,
    },
    {
      sku: "FER-CHV-014",
      name: "Chave Combinada 13mm",
      category: "Ferramentas",
      unit: "un",
      supplier: "Ferragens Brasil Ltda",
      minStock: 5,
      currentStock: 12,
    },
    {
      sku: "LIM-DET-008",
      name: "Detergente Neutro Industrial 5L",
      category: "Limpeza Técnica",
      unit: "un",
      supplier: "Química Industrial Sul",
      minStock: 4,
      currentStock: 3,
    },
  ]);

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

export function generateTemplateCsv(): string {
  const lines = [
    "SKU;Nome;Categoria;Unidade;Fornecedor;Estoque Minimo;Saldo Atual",
    "EPI-CAP-001;Capacete de Segurança Branco;EPIs;un;SegurPro Distribuidora;10;25",
    "FER-CHV-014;Chave Combinada 13mm;Ferramentas;un;Ferragens Brasil Ltda;5;12",
    "LIM-DET-008;Detergente Neutro Industrial 5L;Limpeza Técnica;un;Química Industrial Sul;4;3",
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}
