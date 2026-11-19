import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createCollaborator } from "@/lib/services/collaborator-service";
import {
  buildImportPreview,
  commitImport,
  parseSpreadsheetBuffer,
} from "@/lib/services/import-service";
import {
  createProduct,
  exportMovementsCsv,
  getProductById,
  listMovements,
  registerWithdrawal,
} from "@/lib/services/inventory-service";
import { initTestDb, resetTestDb } from "./db-helper";

describe("Log de Auditoria e Importação Excel/CSV", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("filtra movimentações por produto, colaborador e tipo e exporta CSV seguro", async () => {
    const c1 = await createCollaborator({ name: "Carlos Almoxarife" });
    const c2 = await createCollaborator({ name: "Ana Técnica" });

    const p1 = await createProduct({
      sku: "AUD-001",
      name: "Capacete",
      category: "EPIs",
      unit: "un",
      minStock: 2,
      currentStock: 10,
      collaboratorId: c1.id,
    });

    await registerWithdrawal({
      productId: p1.id,
      quantity: 3,
      collaboratorId: c2.id,
      reason: "=SUM(A1:A2) Teste Formula",
    });

    const exitsByAna = await listMovements({
      productId: p1.id,
      collaboratorId: c2.id,
      type: "EXIT",
    });
    expect(exitsByAna.total).toBe(1);
    expect(exitsByAna.movements[0].newStock).toBe(7);

    const csv = await exportMovementsCsv({ productId: p1.id, type: "EXIT" });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=SUM(A1:A2) Teste Formula");
  });

  it("lê CSV PT-BR com separador ';' e valida erros e duplicidades", async () => {
    await createProduct({
      sku: "EXIST-01",
      name: "Item Já Existente",
      category: "Geral",
      unit: "un",
      minStock: 1,
      currentStock: 5,
    });

    const csvContent = [
      "\uFEFFCódigo;Produto;Categoria;Unidade;Fornecedor;Estoque Mínimo;Saldo Atual",
      "EXIST-01;Item Já Existente;Geral;un;Forn A;2;10",
      "NOVO-02;Cabo Rede Cat6;TI;m;Forn B;10;25,5",
      ";Produto Sem SKU;TI;un;;1;4",
      "NOVO-02;Duplicado no Arquivo;TI;un;;1;2",
    ].join("\r\n");

    const { headers, rows } = await parseSpreadsheetBuffer(
      Buffer.from(csvContent, "utf-8"),
      "estoque.csv"
    );

    const preview = await buildImportPreview("estoque.csv", headers, rows);
    expect(preview.rawRowCount).toBe(4);
    expect(preview.validCount).toBe(2);
    expect(preview.errorCount).toBe(2);
    expect(preview.existingCount).toBe(1);
    expect(preview.newCount).toBe(1);

    const validRowNovo = preview.previewRows.find((r) => r.sku === "NOVO-02" && r.errors.length === 0);
    expect(validRowNovo?.currentStock).toBe(25.5);
  });

  it("lê arquivo Excel .xlsx real e executa importação com estratégias SKIP, ADD_STOCK e REPLACE_STOCK", async () => {
    const existing = await createProduct({
      sku: "XLSX-01",
      name: "Fita Isolante",
      category: "Elétrica",
      unit: "un",
      minStock: 5,
      currentStock: 10,
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Base");
    sheet.addRow(["SKU", "Nome", "Categoria", "Unidade", "Fornecedor", "Minimo", "Saldo"]);
    sheet.addRow(["XLSX-01", "Fita Isolante", "Elétrica", "un", "Volt", 5, 4]);
    sheet.addRow(["XLSX-02", "Chave Philips", "Ferramentas", "un", "Ferragens", 2, 15]);
    const xlsxBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const { headers, rows } = await parseSpreadsheetBuffer(xlsxBuffer, "base.xlsx");
    const preview = await buildImportPreview("base.xlsx", headers, rows);
    expect(preview.validCount).toBe(2);

    const validRows = preview.previewRows.map((r) => ({
      sku: r.sku,
      name: r.name,
      category: r.category,
      unit: r.unit,
      supplier: r.supplier,
      minStock: r.minStock,
      currentStock: r.currentStock,
    }));

    // 1. SKIP skips existing XLSX-01 and creates XLSX-02
    const resSkip = await commitImport({ rows: validRows, strategy: "SKIP" });
    expect(resSkip).toEqual({ created: 1, updated: 0, skipped: 1, movementsLogged: 1 });
    expect((await getProductById(existing.id)).currentStock).toBe(10);

    // 2. ADD_STOCK adds 4 to XLSX-01 (10 -> 14)
    const resAdd = await commitImport({
      rows: [validRows[0]],
      strategy: "ADD_STOCK",
    });
    expect(resAdd).toEqual({ created: 0, updated: 1, skipped: 0, movementsLogged: 1 });
    expect((await getProductById(existing.id)).currentStock).toBe(14);

    // 3. REPLACE_STOCK replaces XLSX-01 back to 4 (14 -> 4)
    const resReplace = await commitImport({
      rows: [validRows[0]],
      strategy: "REPLACE_STOCK",
    });
    expect(resReplace).toEqual({ created: 0, updated: 1, skipped: 0, movementsLogged: 1 });
    expect((await getProductById(existing.id)).currentStock).toBe(4);
  });
});
