import ExcelJS from "exceljs";
import { ensureSqliteReady, prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/services/collaborator-service";
import { withSqliteRetry } from "@/lib/services/inventory-service";
import { importCommitSchema, normalizeSku, roundQuantity } from "@/lib/validators";
import type {
  EntryOrderImportPreviewResponse,
  EntryOrderMatchedItem,
  EntryOrderUnmatchedRow,
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

const BRAND_MAP: Record<string, string> = {
  CHEVROLET: "Chevrolet",
  GM: "Chevrolet",
  CITROEN: "Citroën",
  FIAT: "Fiat",
  FORD: "Ford",
  HONDA: "Honda",
  HYUNDAI: "Hyundai",
  HYUNDAY: "Hyundai",
  KIA: "Kia",
  IVECO: "Iveco",
  MB: "Mercedes-Benz",
  MERCEDES: "Mercedes-Benz",
  MITSUBICHI: "Mitsubishi",
  MITSUBISHI: "Mitsubishi",
  PEUGEOT: "Peugeot",
  RENAULT: "Renault",
  NISSAN: "Nissan",
  TOYOTA: "Toyota",
  VW: "Volkswagen",
  VOLKSWAGEN: "Volkswagen",
};

export function inferAutomakerFromName(name: string, fallback = "Outros"): string {
  const words = name.trim().toUpperCase().split(/\s+/);
  if (words.length >= 2 && (words[0] === "VOL" || words[0] === "VOLANTE")) {
    const candidate = words[1];
    if (BRAND_MAP[candidate]) {
      return BRAND_MAP[candidate];
    }
  }
  for (const word of words) {
    if (BRAND_MAP[word]) {
      return BRAND_MAP[word];
    }
  }
  return fallback;
}

const COLUMN_ALIASES: Record<ImportColumnKey, string[]> = {
  sku: ["sku", "codigo", "cod", "codigo interno", "ref", "referencia"],
  name: ["descricao", "nome", "produto", "volante", "item", "material", "nome do produto"],
  category: ["montadora", "marca", "categoria", "grupo", "familia", "tipo"],
  weightGrams: ["peso", "peso g", "peso gramas", "weight"],
  unit: ["unidade", "un", "und", "um", "unidade de medida", "medida"],
  supplier: ["fornecedor", "fabricante", "distribuidor"],
  minStock: ["estoque minimo", "minimo", "qtd minima", "alerta", "estoque alerta", "min"],
  currentStock: [
    "saldo atual",
    "saldo",
    "estoque atual",
    "estoque",
    "quantidade",
    "qtd",
    "qtde",
    "disponivel",
  ],
};

function uniquifyHeaders(rawHeaders: string[]): string[] {
  const counts = new Map<string, number>();
  return rawHeaders.map((raw, idx) => {
    const base = raw.trim() || `Coluna_${idx + 1}`;
    const prev = counts.get(base) ?? 0;
    counts.set(base, prev + 1);
    return prev === 0 ? base : `${base} (${prev + 1})`;
  });
}

function isLikelyHeaderRow(cells: string[]): boolean {
  const normalized = cells.map(normalizeHeader).filter(Boolean);
  if (normalized.length < 2) return false;
  const hasCode = normalized.some((h) => COLUMN_ALIASES.sku.includes(h));
  const hasName = normalized.some((h) => COLUMN_ALIASES.name.includes(h));
  return hasCode && hasName;
}

function isFooterSummaryRow(cells: string[]): boolean {
  const firstNonEmpty = cells.find((c) => c.trim().length > 0)?.trim().toUpperCase() ?? "";
  return (
    firstNonEmpty === "TOTAIS" ||
    firstNonEmpty === "TOTAL" ||
    firstNonEmpty === "STATUS" ||
    firstNonEmpty === "RESOLVIDO"
  );
}

export function suggestColumnMapping(headers: string[]): ImportColumnMapping {
  const mapping: ImportColumnMapping = {
    sku: null,
    name: null,
    category: null,
    weightGrams: null,
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

  const sampleLine = lines.slice(0, 10).find((l) => l.includes(";") || l.includes(",")) ?? lines[0];
  const semicolonCount = (sampleLine.match(/;/g) ?? []).length;
  const commaCount = (sampleLine.match(/,/g) ?? []).length;
  const delimiter = semicolonCount >= commaCount ? ";" : ",";

  const parsedLines = lines.map((line) => splitCsvLine(line, delimiter));
  let headerIdx = parsedLines.slice(0, 20).findIndex(isLikelyHeaderRow);
  if (headerIdx === -1) {
    headerIdx = 0;
  }

  const headers = uniquifyHeaders(parsedLines[headerIdx]);
  const rows: Record<string, string>[] = [];

  for (let i = headerIdx + 1; i < parsedLines.length && rows.length < MAX_IMPORT_ROWS; i += 1) {
    const values = parsedLines[i];
    if (values.every((v) => v === "")) continue;
    if (isFooterSummaryRow(values)) break;

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

  let headerRowIndex = 1;
  const maxScan = Math.min(20, worksheet.rowCount);
  for (let r = 1; r <= maxScan; r += 1) {
    const row = worksheet.getRow(r);
    const colCount = Math.max(row.cellCount, row.actualCellCount);
    const cells = Array.from({ length: colCount }, (_, idx) =>
      cellValueToString(row.getCell(idx + 1).value)
    );
    if (isLikelyHeaderRow(cells)) {
      headerRowIndex = r;
      break;
    }
  }

  const headerRow = worksheet.getRow(headerRowIndex);
  const rawHeaders: string[] = [];
  const colCount = Math.max(headerRow.cellCount, headerRow.actualCellCount);

  for (let c = 1; c <= colCount; c += 1) {
    rawHeaders.push(cellValueToString(headerRow.getCell(c).value));
  }

  const headers = uniquifyHeaders(rawHeaders);
  if (headers.length === 0) {
    throw new ValidationError("Não foi possível identificar o cabeçalho na planilha.");
  }

  const rows: Record<string, string>[] = [];
  for (let r = headerRowIndex + 1; r <= worksheet.rowCount && rows.length < MAX_IMPORT_ROWS; r += 1) {
    const row = worksheet.getRow(r);
    const cells = Array.from({ length: headers.length }, (_, idx) =>
      cellValueToString(row.getCell(idx + 1).value)
    );
    if (cells.every((c) => c === "")) continue;
    if (isFooterSummaryRow(cells)) break;

    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = cells[idx] ?? "";
    });
    rows.push(record);
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
    const explicitCategory = getVal("category");
    const category = explicitCategory || inferAutomakerFromName(name, "Outros");
    const unit = getVal("unit") || "un";
    const supplierVal = getVal("supplier");
    const supplier = supplierVal.length > 0 ? supplierVal : "Garfer";

    const rawWeight = getVal("weightGrams");
    const weightParsed = rawWeight ? parseLocaleNumber(rawWeight) : null;

    const minStockParsed = parseLocaleNumber(getVal("minStock"));
    const currentStockParsed = parseLocaleNumber(getVal("currentStock"));

    if (!sku) {
      errors.push("Código/SKU obrigatório");
    } else {
      const previousRow = seenSkusInFile.get(sku);
      if (previousRow !== undefined) {
        errors.push(`Código duplicado nesta planilha (já aparece na linha ${previousRow})`);
      } else {
        seenSkusInFile.set(sku, rowNumber);
      }
    }

    if (!name) {
      errors.push("Descrição do volante obrigatória");
    }

    if (rawWeight && (weightParsed === null || weightParsed < 0)) {
      errors.push("Peso (g) inválido");
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
      weightGrams: weightParsed !== null && weightParsed >= 0 ? roundQuantity(weightParsed, 2) : null,
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

  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.sku)) {
      throw new ValidationError(`Código/SKU duplicado no lote de importação: ${row.sku}`);
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
                weightGrams: row.weightGrams ?? null,
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

          if (strategy === "UPDATE_METADATA") {
            await tx.product.update({
              where: { id: existing.id },
              data: {
                name: row.name,
                category: row.category,
                weightGrams: row.weightGrams ?? existing.weightGrams,
                unit: row.unit,
                supplier: row.supplier ?? existing.supplier,
                active: true,
              },
            });
            updated += 1;
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
              weightGrams: row.weightGrams ?? existing.weightGrams,
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
  const sheet = workbook.addWorksheet("Volantes");

  sheet.columns = [
    { header: "CÓDIGO", key: "sku", width: 16 },
    { header: "DESCRIÇÃO", key: "name", width: 42 },
    { header: "MONTADORA", key: "category", width: 18 },
    { header: "PESO", key: "weightGrams", width: 14 },
    { header: "UNIDADE", key: "unit", width: 12 },
    { header: "FORNECEDOR", key: "supplier", width: 18 },
    { header: "ESTOQUE MÍNIMO", key: "minStock", width: 16 },
    { header: "SALDO ATUAL", key: "currentStock", width: 15 },
  ];

  sheet.getRow(1).font = { bold: true };

  sheet.addRows([
    {
      sku: "VI0487",
      name: "VOL CHEVROLET AGILE",
      category: "Chevrolet",
      weightGrams: 1346,
      unit: "un",
      supplier: "Garfer",
      minStock: 2,
      currentStock: 5,
    },
    {
      sku: "VI0265",
      name: "VOL FIAT UNO FIRE",
      category: "Fiat",
      weightGrams: 2038,
      unit: "un",
      supplier: "Garfer",
      minStock: 2,
      currentStock: 8,
    },
    {
      sku: "VI1171",
      name: "VOL VW GOL G5",
      category: "Volkswagen",
      weightGrams: 2052,
      unit: "un",
      supplier: "Garfer",
      minStock: 3,
      currentStock: 10,
    },
  ]);

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

export function generateTemplateCsv(): string {
  const lines = [
    "CÓDIGO;DESCRIÇÃO;MONTADORA;PESO;UNIDADE;FORNECEDOR;ESTOQUE MÍNIMO;SALDO ATUAL",
    "VI0487;VOL CHEVROLET AGILE;Chevrolet;1346;un;Garfer;2;5",
    "VI0265;VOL FIAT UNO FIRE;Fiat;2038;un;Garfer;2;8",
    "VI1171;VOL VW GOL G5;Volkswagen;2052;un;Garfer;3;10",
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

const ENTRY_QTY_ALIASES = [
  "quantidade",
  "qtd",
  "qtde",
  "ped",
  "pedido",
  "sub",
  "unidades",
  "qnt",
  "entrada",
  "recebido",
];

function normalizeModelSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestEntryOrderColumns(headers: string[]): {
  codeCol: string | null;
  modelCol: string | null;
  qtyCol: string | null;
} {
  const normalized = headers.map((h) => ({
    original: h,
    norm: normalizeHeader(h),
  }));

  const findMatch = (aliases: string[]): string | null => {
    const exact = normalized.find((h) => aliases.includes(h.norm));
    if (exact) return exact.original;
    const partial = normalized.find((h) =>
      aliases.some((alias) => alias.length >= 3 && h.norm.includes(alias))
    );
    return partial?.original ?? null;
  };

  return {
    codeCol: findMatch(COLUMN_ALIASES.sku),
    modelCol: findMatch(COLUMN_ALIASES.name),
    qtyCol: findMatch(ENTRY_QTY_ALIASES),
  };
}

export async function buildEntryOrderImportPreview(
  fileName: string,
  headers: string[],
  rawRows: Record<string, string>[],
  customColumns?: {
    codeCol?: string | null;
    modelCol?: string | null;
    qtyCol?: string | null;
  }
): Promise<EntryOrderImportPreviewResponse> {
  await ensureSqliteReady();

  const suggested = suggestEntryOrderColumns(headers);
  const codeCol = customColumns?.codeCol !== undefined ? customColumns.codeCol : suggested.codeCol;
  const modelCol =
    customColumns?.modelCol !== undefined ? customColumns.modelCol : suggested.modelCol;
  const qtyCol = customColumns?.qtyCol !== undefined ? customColumns.qtyCol : suggested.qtyCol;

  const products = await prisma.product.findMany({
    where: { active: true },
    select: { id: true, sku: true, name: true, unit: true, currentStock: true },
  });

  const bySku = new Map<string, (typeof products)[number]>();
  const byExactName = new Map<string, (typeof products)[number]>();

  for (const p of products) {
    bySku.set(normalizeSku(p.sku), p);
    byExactName.set(normalizeModelSearch(p.name), p);
  }

  const matchedMap = new Map<string, EntryOrderMatchedItem>();
  const unmatchedRows: EntryOrderUnmatchedRow[] = [];
  let skippedZeroCount = 0;

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rawCode = codeCol ? (row[codeCol] ?? "").trim() : "";
    const rawModel = modelCol ? (row[modelCol] ?? "").trim() : "";
    const rawQty = qtyCol ? (row[qtyCol] ?? "").trim() : "";

    if (!rawCode && !rawModel) {
      return;
    }

    if (!qtyCol) {
      unmatchedRows.push({
        rowNumber,
        rawModel: rawModel || rawCode,
        rawQuantity: rawQty,
        reason: "Coluna de quantidade não mapeada",
      });
      return;
    }

    if (!rawQty) {
      skippedZeroCount += 1;
      return;
    }

    const parsedQty = parseLocaleNumber(rawQty);
    if (parsedQty === null || parsedQty < 0) {
      unmatchedRows.push({
        rowNumber,
        rawModel: rawModel || rawCode,
        rawQuantity: rawQty,
        reason: "Quantidade inválida",
      });
      return;
    }

    if (parsedQty === 0) {
      skippedZeroCount += 1;
      return;
    }

    let matchedProduct: (typeof products)[number] | undefined;

    if (rawCode) {
      matchedProduct = bySku.get(normalizeSku(rawCode));
    }

    if (!matchedProduct && rawModel) {
      const normalizedModel = normalizeModelSearch(rawModel);
      matchedProduct = byExactName.get(normalizedModel) ?? bySku.get(normalizeSku(rawModel));

      if (!matchedProduct) {
        const candidates = products.filter((p) => {
          const pNorm = normalizeModelSearch(p.name);
          return pNorm.includes(normalizedModel) || normalizedModel.includes(pNorm);
        });
        if (candidates.length === 1) {
          matchedProduct = candidates[0];
        } else if (candidates.length > 1) {
          unmatchedRows.push({
            rowNumber,
            rawModel: rawModel || rawCode,
            rawQuantity: rawQty,
            reason: `Múltiplos modelos parecidos (${candidates.length}); especifique o código ou descrição exata`,
          });
          return;
        }
      }
    }

    if (!matchedProduct) {
      unmatchedRows.push({
        rowNumber,
        rawModel: rawModel || rawCode,
        rawQuantity: rawQty,
        reason: "Modelo/Código não encontrado no catálogo ativo",
      });
      return;
    }

    const existing = matchedMap.get(matchedProduct.id);
    if (existing) {
      existing.quantity = roundQuantity(existing.quantity + parsedQty);
    } else {
      matchedMap.set(matchedProduct.id, {
        productId: matchedProduct.id,
        sku: matchedProduct.sku,
        name: matchedProduct.name,
        unit: matchedProduct.unit,
        currentStock: roundQuantity(matchedProduct.currentStock),
        quantity: roundQuantity(parsedQty),
      });
    }
  });

  return {
    fileName,
    headers,
    rawRowCount: rawRows.length,
    rawRows,
    suggestedModelCol: modelCol,
    suggestedCodeCol: codeCol,
    suggestedQtyCol: qtyCol,
    matchedItems: Array.from(matchedMap.values()),
    unmatchedRows,
    skippedZeroCount,
  };
}
