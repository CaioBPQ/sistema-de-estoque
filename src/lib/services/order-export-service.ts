import path from "path";
import { access } from "fs/promises";
import ExcelJS from "exceljs";
import { ServiceError } from "@/lib/services/collaborator-service";
import { inferAutomakerFromName } from "@/lib/services/import-service";
import { orderExportSchema, roundQuantity } from "@/lib/validators";
import type {
  OrderExportItemInput,
  OrderHeaderFields,
  OrderTemplateCatalogItem,
  OrderTemplateResponse,
} from "@/types/inventory";

export const ORDER_TEMPLATE_FILENAME = "REMANUFATURADO NOVEMBRO 2026 ATUALIZADO.xlsx";
export const ORDER_SHEET_NAME = "PEDIDO NOVEMBRO 2026";
export const CONFERENCE_SHEET_NAME = "CONFERÊNCIA";
export const FIRST_CATALOG_ROW = 7;
export const LAST_CATALOG_ROW = 241;
export const TOTALS_ROW = 243;

const COL_SKU = 1; // A
const COL_WEIGHT = 2; // B
const COL_DESCRIPTION = 3; // C
const COL_PED = 5; // E
const COL_RET = 6; // F
const COL_SUB = 7; // G (=E+F)
const COL_REAL = 8; // H
const COL_WEIGHT_TOTAL = 9; // I (=B*G)
const COL_VALOR = 10; // J
const COL_TOTAL = 11; // K (=H*J)

export function getOrderTemplatePath(): string {
  return path.join(process.cwd(), "prisma", "templates", ORDER_TEMPLATE_FILENAME);
}

async function openOfficialTemplateWorkbook(): Promise<{
  workbook: ExcelJS.Workbook;
  orderSheet: ExcelJS.Worksheet;
}> {
  const templatePath = getOrderTemplatePath();
  try {
    await access(templatePath);
  } catch {
    throw new ServiceError(
      `Template oficial "${ORDER_TEMPLATE_FILENAME}" não encontrado em prisma/templates.`,
      500
    );
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const orderSheet = workbook.getWorksheet(ORDER_SHEET_NAME);
  if (!orderSheet) {
    throw new ServiceError(
      `Aba obrigatória "${ORDER_SHEET_NAME}" não encontrada no molde oficial.`,
      500
    );
  }

  return { workbook, orderSheet };
}

function readCellText(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number" || typeof val === "boolean") return String(val).trim();
  if (typeof val === "object" && "richText" in val && Array.isArray(val.richText)) {
    return val.richText.map((part) => part.text ?? "").join("").trim();
  }
  return String(val).trim();
}

function readNumericCell(cell: ExcelJS.Cell): number | null {
  const val = cell.value;
  if (typeof val === "number" && Number.isFinite(val)) {
    return val;
  }
  if (typeof val === "string") {
    const parsed = Number(val.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatHeaderDateForSheet(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  return trimmed;
}

/**
 * Updates cached `<v>` on an existing Excel formula / sharedFormula cell without
 * replacing `cell.value` (which would break sharedFormula master/slave references).
 */
function updateCachedFormulaResult(cell: ExcelJS.Cell, result: number): void {
  const model = cell.model as {
    formula?: string;
    sharedFormula?: string;
    result?: unknown;
  };
  if (model.formula !== undefined || model.sharedFormula !== undefined) {
    model.result = result;
  }
}

function positiveOrNull(value: number | null | undefined, decimals: number): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return roundQuantity(value, decimals);
}

function buildExportFileName(cliente: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const cleanClient = cliente
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

  return cleanClient
    ? `PEDIDO_VOLANTES_${cleanClient}_${today}.xlsx`
    : `PEDIDO_VOLANTES_${today}.xlsx`;
}

export async function loadOrderTemplateCatalog(): Promise<OrderTemplateResponse> {
  const { orderSheet } = await openOfficialTemplateWorkbook();

  const items: OrderTemplateCatalogItem[] = [];
  for (let rowNumber = FIRST_CATALOG_ROW; rowNumber <= LAST_CATALOG_ROW; rowNumber += 1) {
    const row = orderSheet.getRow(rowNumber);
    const sku = readCellText(row.getCell(COL_SKU));
    const description = readCellText(row.getCell(COL_DESCRIPTION));
    const weightGrams = readNumericCell(row.getCell(COL_WEIGHT)) ?? 0;

    if (!sku && !description) {
      continue;
    }

    items.push({
      rowNumber,
      sku,
      weightGrams,
      description,
      category: inferAutomakerFromName(description),
      templatePed: null,
    });
  }

  const defaultHeader: OrderHeaderFields = {
    cliente: "",
    tipo: "",
    obs: "",
    dataInicial: "",
    dataFinal: "",
    comercial: "",
    expedicao: "",
    hora: "",
    horaFinal: "",
  };

  return {
    templateName: ORDER_TEMPLATE_FILENAME,
    sheetName: ORDER_SHEET_NAME,
    firstCatalogRow: FIRST_CATALOG_ROW,
    lastCatalogRow: LAST_CATALOG_ROW,
    defaultHeader,
    items,
  };
}

export async function exportOrderToWorkbookBuffer(
  rawInput: unknown
): Promise<{ buffer: Buffer; fileName: string; totalPed: number; totalWeightGrams: number; totalValue: number }> {
  const parsed = orderExportSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new ServiceError(firstIssue?.message ?? "Dados do pedido inválidos para exportação.", 400);
  }

  const { header, items } = parsed.data;
  const itemByRow = new Map<number, OrderExportItemInput>();
  for (const item of items) {
    itemByRow.set(item.rowNumber, item);
  }

  const { workbook, orderSheet } = await openOfficialTemplateWorkbook();

  // Fill header input cells mapped directly beside rows 3-5 labels
  orderSheet.getCell("B3").value = header.cliente ? header.cliente : null;
  orderSheet.getCell("B4").value = header.tipo ? header.tipo : null;
  orderSheet.getCell("B5").value = header.obs ? header.obs : null;
  orderSheet.getCell("F3").value = formatHeaderDateForSheet(header.dataInicial);
  orderSheet.getCell("F4").value = formatHeaderDateForSheet(header.dataFinal);
  orderSheet.getCell("F5").value = header.comercial ? header.comercial : null;
  orderSheet.getCell("K3").value = header.hora ? header.hora : null;
  orderSheet.getCell("K4").value = header.horaFinal ? header.horaFinal : null;
  orderSheet.getCell("K5").value = header.expedicao ? header.expedicao : null;

  let sumPed = 0;
  let sumRet = 0;
  let sumSub = 0;
  let sumReal = 0;
  let sumWeightGrams = 0;
  let sumTotal = 0;

  for (let rowNumber = FIRST_CATALOG_ROW; rowNumber <= LAST_CATALOG_ROW; rowNumber += 1) {
    const row = orderSheet.getRow(rowNumber);
    const input = itemByRow.get(rowNumber);

    const ped = positiveOrNull(input?.ped, 3);
    const ret = positiveOrNull(input?.ret, 3);
    const real = positiveOrNull(input?.real, 3);
    const valor = positiveOrNull(input?.valor, 2);

    // Clear stale reference quantities and write only allowed editable columns (E, F, H, J)
    row.getCell(COL_PED).value = ped;
    row.getCell(COL_RET).value = ret;
    row.getCell(COL_REAL).value = real;
    row.getCell(COL_VALOR).value = valor;

    const unitWeight = readNumericCell(row.getCell(COL_WEIGHT)) ?? 0;
    const sub = roundQuantity((ped ?? 0) + (ret ?? 0), 3);
    const rowWeight = roundQuantity(unitWeight * sub, 3);
    const rowTotal = roundQuantity((real ?? 0) * (valor ?? 0), 2);

    // Keep G, I, K shared formulas untouched; only sync cached values
    updateCachedFormulaResult(row.getCell(COL_SUB), sub);
    updateCachedFormulaResult(row.getCell(COL_WEIGHT_TOTAL), rowWeight);
    updateCachedFormulaResult(row.getCell(COL_TOTAL), rowTotal);

    sumPed = roundQuantity(sumPed + (ped ?? 0), 3);
    sumRet = roundQuantity(sumRet + (ret ?? 0), 3);
    sumSub = roundQuantity(sumSub + sub, 3);
    sumReal = roundQuantity(sumReal + (real ?? 0), 3);
    sumWeightGrams = roundQuantity(sumWeightGrams + rowWeight, 3);
    sumTotal = roundQuantity(sumTotal + rowTotal, 2);
  }

  // Sync cached totals on row 243 without touching SUM formulas (E243:I243, K243)
  const totalsRow = orderSheet.getRow(TOTALS_ROW);
  updateCachedFormulaResult(totalsRow.getCell(COL_PED), sumPed);
  updateCachedFormulaResult(totalsRow.getCell(COL_RET), sumRet);
  updateCachedFormulaResult(totalsRow.getCell(COL_SUB), sumSub);
  updateCachedFormulaResult(totalsRow.getCell(COL_REAL), sumReal);
  updateCachedFormulaResult(totalsRow.getCell(COL_WEIGHT_TOTAL), sumWeightGrams);
  updateCachedFormulaResult(totalsRow.getCell(COL_TOTAL), sumTotal);

  workbook.calcProperties.fullCalcOnLoad = true;

  const rawBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(rawBuffer);

  return {
    buffer,
    fileName: buildExportFileName(header.cliente),
    totalPed: sumPed,
    totalWeightGrams: sumWeightGrams,
    totalValue: sumTotal,
  };
}
