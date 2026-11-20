import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as orderExportPost } from "@/app/api/orders/export/route";
import { GET as orderTemplateGet } from "@/app/api/orders/template/route";
import { prisma } from "@/lib/prisma";
import { createCollaborator } from "@/lib/services/collaborator-service";
import {
  CONFERENCE_SHEET_NAME,
  ORDER_SHEET_NAME,
  exportOrderToWorkbookBuffer,
  loadOrderTemplateCatalog,
} from "@/lib/services/order-export-service";
import { initTestDb, resetTestDb } from "./db-helper";

describe("Módulo de Criação e Exportação de Pedidos (Template Oficial Excel)", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("carrega exatamente os 235 modelos oficiais (linhas 7 a 241) na ordem original", async () => {
    const template = await loadOrderTemplateCatalog();

    expect(template.sheetName).toBe(ORDER_SHEET_NAME);
    expect(template.firstCatalogRow).toBe(7);
    expect(template.lastCatalogRow).toBe(241);
    expect(template.items).toHaveLength(235);

    expect(template.items[0]).toMatchObject({
      rowNumber: 7,
      sku: "VI0487",
      weightGrams: 1346,
      description: "VOL CHEVROLET AGILE",
    });
    expect(template.items[template.items.length - 1]).toMatchObject({
      rowNumber: 241,
      sku: "VI1191",
      weightGrams: 2010,
      description: "VOL VW GOL RALLYE ORIGINAL",
    });

    // Preserva códigos repetidos em linhas distintas do molde oficial
    const row43 = template.items.find((item) => item.rowNumber === 43);
    const row136 = template.items.find((item) => item.rowNumber === 136);
    expect(row43?.sku).toBe("VI1267");
    expect(row43?.description).toContain("TRACKER");
    expect(row136?.sku).toBe("VI1267");
    expect(row136?.description).toContain("IVECO DAILY");
  });

  it("clona o template preservando 100% das fórmulas, mesclagens, aba CONFERÊNCIA e preenche cabeçalho + itens", async () => {
    const result = await exportOrderToWorkbookBuffer({
      header: {
        cliente: "Auto Peças Vitoria LTDA",
        tipo: "Base de Troca",
        obs: "Entrega prioritária",
        dataInicial: "2026-11-20",
        dataFinal: "2026-11-22",
        comercial: "Luiz",
        expedicao: "Carlinho",
        hora: "08:30",
        horaFinal: "17:00",
      },
      items: [
        { rowNumber: 7, ped: 3, ret: 2, real: 4, valor: 120 },
        { rowNumber: 136, ped: 3, ret: null, real: 3, valor: 150 },
      ],
    });

    expect(result.totalPed).toBe(6);
    expect(result.totalWeightGrams).toBe(11668);
    expect(result.totalValue).toBe(930);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer as unknown as ArrayBuffer);

    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      ORDER_SHEET_NAME,
      CONFERENCE_SHEET_NAME,
    ]);

    const ws = wb.getWorksheet(ORDER_SHEET_NAME);
    expect(ws).toBeDefined();
    if (!ws) return;

    // Mesclagem principal e cabeçalho da linha 2 preservados
    expect(ws.model.merges).toContain("A2:K2");
    expect(ws.getCell("A2").value).toBe(
      "PLANILHA PARA PEDIDOS A BASE DE TROCA GARFER - NOVEMBRO 2026"
    );
    expect(ws.getColumn(3).width).toBe(52);

    // Cabeçalho (linhas 3 a 5) preenchido nos alvos corretos
    expect(ws.getCell("B3").value).toBe("Auto Peças Vitoria LTDA");
    expect(ws.getCell("B4").value).toBe("Base de Troca");
    expect(ws.getCell("B5").value).toBe("Entrega prioritária");
    expect(ws.getCell("F3").value).toBe("20/11/2026");
    expect(ws.getCell("F4").value).toBe("22/11/2026");
    expect(ws.getCell("F5").value).toBe("Luiz");
    expect(ws.getCell("K3").value).toBe("08:30");
    expect(ws.getCell("K4").value).toBe("17:00");
    expect(ws.getCell("K5").value).toBe("Carlinho");

    // Itens editáveis preenchidos e linhas não selecionadas limpas (sem vazar amostra antiga do E8)
    expect(ws.getCell("E7").value).toBe(3);
    expect(ws.getCell("F7").value).toBe(2);
    expect(ws.getCell("H7").value).toBe(4);
    expect(ws.getCell("J7").value).toBe(120);
    expect(ws.getCell("E8").value).toBeNull();
    expect(ws.getCell("E136").value).toBe(3);
    expect(ws.getCell("H136").value).toBe(3);
    expect(ws.getCell("J136").value).toBe(150);

    // Fórmulas compartilhadas originais e resultados cacheados intactos nas colunas G, I, K e linha 243
    const g7Model = ws.getCell("G7").model as {
      formula?: string;
      ref?: string;
      shareType?: string;
      result?: number;
    };
    expect(g7Model.formula).toBe("E7+F7");
    expect(g7Model.ref).toBe("G7:G241");
    expect(g7Model.shareType).toBe("shared");
    expect(g7Model.result).toBe(5);

    const g136Model = ws.getCell("G136").model as {
      sharedFormula?: string;
      result?: number;
    };
    expect(g136Model.sharedFormula).toBe("G7");
    expect(g136Model.result).toBe(3);

    // Linhas não preenchidas tiveram o cache antigo zerado sem perder a fórmula compartilhada
    const g8Model = ws.getCell("G8").model as {
      sharedFormula?: string;
      result?: number;
    };
    expect(g8Model.sharedFormula).toBe("G7");
    expect(g8Model.result).toBe(0);
    expect((ws.getCell("I8").model as { sharedFormula?: string; result?: number }).result).toBe(0);

    const i7Model = ws.getCell("I7").model as { formula?: string; result?: number };
    expect(i7Model.formula).toBe("B7*G7");
    expect(i7Model.result).toBe(6730);

    const k7Model = ws.getCell("K7").model as { formula?: string; result?: number };
    expect(k7Model.formula).toBe("H7*J7");
    expect(k7Model.result).toBe(480);

    const e243Model = ws.getCell("E243").model as {
      formula?: string;
      ref?: string;
      result?: number;
    };
    expect(e243Model.formula).toBe("SUM(E7:E241)");
    expect(e243Model.ref).toBe("E243:I243");
    expect(e243Model.result).toBe(6);

    expect((ws.getCell("F243").model as { sharedFormula?: string; result?: number }).result).toBe(2);
    expect((ws.getCell("G243").model as { result?: number }).result).toBe(8);
    expect((ws.getCell("H243").model as { result?: number }).result).toBe(7);
    expect((ws.getCell("I243").model as { result?: number }).result).toBe(11668);
    expect((ws.getCell("K243").model as { formula?: string; result?: number }).formula).toBe(
      "SUM(K7:K241)"
    );
    expect((ws.getCell("K243").model as { result?: number }).result).toBe(930);

    // Segunda aba CONFERÊNCIA intacta
    const confSheet = wb.getWorksheet(CONFERENCE_SHEET_NAME);
    expect(confSheet).toBeDefined();
    expect(confSheet?.model.merges).toContain("A2:E2");
    expect(confSheet?.getCell("A1").value).toBe("STATUS");
    expect(confSheet?.getCell("B3").value).toBe("VI0257");
  });

  it("expõe GET /api/orders/template e POST /api/orders/export para usuários ativos", async () => {
    const mauro = await createCollaborator({ name: "Mauro", role: "EMPLOYEE" });

    const templateRes = await orderTemplateGet(
      new NextRequest("http://localhost/api/orders/template", {
        method: "GET",
        headers: { "x-actor-id": mauro.id },
      })
    );
    expect(templateRes.status).toBe(200);
    const templateJson = (await templateRes.json()) as { items: unknown[] };
    expect(templateJson.items).toHaveLength(235);

    const badRes = await orderExportPost(
      new NextRequest("http://localhost/api/orders/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-id": mauro.id,
        },
        body: JSON.stringify({
          header: { cliente: "Teste" },
          items: [{ rowNumber: 6, ped: 1, ret: null, real: null, valor: null }],
        }),
      })
    );
    expect(badRes.status).toBe(400);

    const okRes = await orderExportPost(
      new NextRequest("http://localhost/api/orders/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-id": mauro.id,
        },
        body: JSON.stringify({
          header: {
            cliente: "Cliente Garfer",
            tipo: "Troca",
            obs: "",
            dataInicial: "2026-11-20",
            dataFinal: "",
            comercial: "Luiz",
            expedicao: "Mauro",
            hora: "09:00",
          },
          items: [{ rowNumber: 7, ped: 2, ret: 1, real: 3, valor: 100 }],
        }),
      })
    );
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(okRes.headers.get("Content-Disposition")).toContain("PEDIDO_VOLANTES_Cliente_Garfer");
    const exportedBytes = await okRes.arrayBuffer();
    expect(exportedBytes.byteLength).toBeGreaterThan(10_000);
  });
});
