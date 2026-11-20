import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as aiChatPost } from "@/app/api/ai/chat/route";
import { POST as entryPost } from "@/app/api/entries/route";
import { POST as productPost } from "@/app/api/products/route";
import { GET as reportGet } from "@/app/api/reports/route";
import { POST as returnPost } from "@/app/api/returns/route";
import { POST as withdrawalPost } from "@/app/api/withdrawals/route";
import { prisma } from "@/lib/prisma";
import { createCollaborator } from "@/lib/services/collaborator-service";
import { queryInventoryAssistant } from "@/lib/services/ai-assistant-service";
import {
  createProduct,
  getManagerReport,
  registerWithdrawal,
} from "@/lib/services/inventory-service";
import { initTestDb, resetTestDb } from "./db-helper";

function makeJsonRequest(url: string, body: unknown, actorId: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": actorId,
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(url: string, actorId: string): NextRequest {
  return new NextRequest(url, {
    method: "GET",
    headers: {
      "x-actor-id": actorId,
    },
  });
}

describe("Perfis de Acesso (Luiz vs Funcionários) e Assistente Virtual IA", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("cruza estoque físico e retiradas no Assistente IA (Disponível, Em uso, Indisponível)", async () => {
    const luiz = await createCollaborator({ name: "Luiz", role: "MANAGER" });
    const mauro = await createCollaborator({ name: "Mauro", role: "EMPLOYEE" });
    const jean = await createCollaborator({ name: "Jean", role: "EMPLOYEE" });

    const agile = await createProduct({
      sku: "VI0487",
      name: "VOL CHEVROLET AGILE",
      category: "Chevrolet",
      weightGrams: 1346,
      unit: "un",
      minStock: 2,
      currentStock: 5,
    });
    const gol = await createProduct({
      sku: "VI1171",
      name: "VOL VW GOL G5",
      category: "Volkswagen",
      weightGrams: 2052,
      unit: "un",
      minStock: 2,
      currentStock: 2,
    });
    await createProduct({
      sku: "VI0265",
      name: "VOL FIAT UNO FIRE",
      category: "Fiat",
      weightGrams: 2038,
      unit: "un",
      minStock: 2,
      currentStock: 0,
    });

    // Mauro withdraws 1 Agile (leaves 4 free + 1 in use with Mauro)
    await registerWithdrawal({
      productId: agile.id,
      quantity: 1,
      collaboratorId: mauro.id,
    });

    // Jean and Luiz withdraw all 2 Gol G5 (0 free + 1 with Jean + 1 with Luiz)
    await registerWithdrawal({
      productId: gol.id,
      quantity: 1,
      collaboratorId: jean.id,
    });
    await registerWithdrawal({
      productId: gol.id,
      quantity: 1,
      collaboratorId: luiz.id,
    });

    // 1. Disponível (with free stock + active holder info)
    const agileRes = await queryInventoryAssistant({
      question: "Tem volante do Agile disponível?",
    });
    expect(agileRes.matches[0].sku).toBe("VI0487");
    expect(agileRes.matches[0].availability).toBe("AVAILABLE");
    expect(agileRes.matches[0].freeStock).toBe(4);
    expect(agileRes.matches[0].holders[0].collaboratorName).toBe("Mauro");
    expect(agileRes.answer).toContain("Disponível");

    // 2. Em uso (0 free stock, held by Jean and Luiz)
    const golRes = await queryInventoryAssistant({
      question: "Como está o volante do Gol G5?",
    });
    expect(golRes.matches[0].sku).toBe("VI1171");
    expect(golRes.matches[0].availability).toBe("IN_USE");
    expect(golRes.matches[0].freeStock).toBe(0);
    expect(golRes.matches[0].holders.map((h) => h.collaboratorName)).toEqual(
      expect.arrayContaining(["Jean", "Luiz"])
    );
    expect(golRes.answer).toContain("Em uso");

    // 3. Indisponível (0 free stock, 0 in use)
    const unoRes = await queryInventoryAssistant({
      question: "Tem volante Uno Fire?",
    });
    expect(unoRes.matches[0].sku).toBe("VI0265");
    expect(unoRes.matches[0].availability).toBe("UNAVAILABLE");
    expect(unoRes.matches[0].freeStock).toBe(0);
    expect(unoRes.matches[0].inUseTotal).toBe(0);
    expect(unoRes.answer).toContain("Indisponível");

    // 4. Custody overview by employee name
    const mauroQuery = await queryInventoryAssistant({
      question: "O que está com o Mauro?",
    });
    expect(mauroQuery.intent).toBe("CUSTODY_OVERVIEW");
    expect(mauroQuery.matches).toHaveLength(1);
    expect(mauroQuery.matches[0].sku).toBe("VI0487");
  });

  it("aplica permissões: Funcionários só retiram/devolvem no próprio nome e Gestor (Luiz) tem acesso completo", async () => {
    const luiz = await createCollaborator({ name: "Luiz", role: "MANAGER" });
    const mauro = await createCollaborator({ name: "Mauro", role: "EMPLOYEE" });
    const carlinho = await createCollaborator({ name: "Carlinho", role: "EMPLOYEE" });

    const prod = await createProduct({
      sku: "VI0488",
      name: "VOL CHEVROLET AGILE AB",
      category: "Chevrolet",
      unit: "un",
      minStock: 2,
      currentStock: 6,
    });

    // Employee blocked from admin routes (403)
    const empCreateProd = await productPost(
      makeJsonRequest(
        "http://localhost/api/products",
        { sku: "X-1", name: "Teste", category: "VW", unit: "un", minStock: 1, currentStock: 1 },
        mauro.id
      )
    );
    expect(empCreateProd.status).toBe(403);

    const empEntry = await entryPost(
      makeJsonRequest(
        "http://localhost/api/entries",
        { supplier: "Garfer", responsibleId: mauro.id, items: [{ productId: prod.id, quantity: 2 }] },
        mauro.id
      )
    );
    expect(empEntry.status).toBe(403);

    const empAi = await aiChatPost(
      makeJsonRequest("http://localhost/api/ai/chat", { question: "Agile" }, mauro.id)
    );
    expect(empAi.status).toBe(403);

    const empReport = await reportGet(makeGetRequest("http://localhost/api/reports", mauro.id));
    expect(empReport.status).toBe(403);

    // Employee cannot withdraw under someone else's name (403)
    const spoofWithdraw = await withdrawalPost(
      makeJsonRequest(
        "http://localhost/api/withdrawals",
        { productId: prod.id, quantity: 1, collaboratorId: carlinho.id },
        mauro.id
      )
    );
    expect(spoofWithdraw.status).toBe(403);

    // Employee CAN freely withdraw and return linked to their own name (201)
    const mauroWithdraw = await withdrawalPost(
      makeJsonRequest(
        "http://localhost/api/withdrawals",
        { productId: prod.id, quantity: 2 },
        mauro.id
      )
    );
    expect(mauroWithdraw.status).toBe(201);

    const mauroReturn = await returnPost(
      makeJsonRequest(
        "http://localhost/api/returns",
        { productId: prod.id, quantity: 1 },
        mauro.id
      )
    );
    expect(mauroReturn.status).toBe(201);

    // Manager (Luiz) CAN access entries, AI assistant, reports, and withdraw/return freely
    const luizWithdraw = await withdrawalPost(
      makeJsonRequest(
        "http://localhost/api/withdrawals",
        { productId: prod.id, quantity: 1, collaboratorId: luiz.id },
        luiz.id
      )
    );
    expect(luizWithdraw.status).toBe(201);

    const luizAi = await aiChatPost(
      makeJsonRequest("http://localhost/api/ai/chat", { question: "VI0488" }, luiz.id)
    );
    expect(luizAi.status).toBe(200);

    const luizReportRes = await reportGet(
      makeGetRequest("http://localhost/api/reports", luiz.id)
    );
    expect(luizReportRes.status).toBe(200);

    const report = await getManagerReport();
    const mauroStats = report.byEmployee.find((e) => e.collaboratorId === mauro.id);
    const luizStats = report.byEmployee.find((e) => e.collaboratorId === luiz.id);

    expect(mauroStats?.withdrawnUnits).toBe(2);
    expect(mauroStats?.returnedUnits).toBe(1);
    expect(mauroStats?.inUseUnits).toBe(1);
    expect(luizStats?.inUseUnits).toBe(1);
    expect(report.totals.totalFreeUnits).toBe(4);
    expect(report.totals.totalInUseUnits).toBe(2);
  });
});
