import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  ConflictError,
  InsufficientStockError,
  createCollaborator,
} from "@/lib/services/collaborator-service";
import {
  createProduct,
  getProductById,
  listPurchaseEntries,
  registerPurchaseEntry,
  registerWithdrawal,
} from "@/lib/services/inventory-service";
import { initTestDb, resetTestDb } from "./db-helper";

describe("Transações de Estoque, Entradas e Retiradas", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("cria produto com saldo inicial auditado e impede SKU duplicado", async () => {
    const prod = await createProduct({
      sku: "epi luv 001",
      name: "Luva Nitrílica",
      category: "EPIs",
      unit: "par",
      supplier: "SegurPro",
      minStock: 5,
      currentStock: 10,
    });

    expect(prod.sku).toBe("EPI-LUV-001");
    expect(prod.status).toBe("OK");

    const movements = await prisma.stockMovement.findMany({
      where: { productId: prod.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe("ENTRY");
    expect(movements[0].previousStock).toBe(0);
    expect(movements[0].newStock).toBe(10);

    await expect(
      createProduct({
        sku: "EPI-LUV-001",
        name: "Outro Nome",
        category: "EPIs",
        unit: "par",
        minStock: 2,
        currentStock: 0,
      })
    ).rejects.toThrow(ConflictError);
  });

  it("registra entrada multi-item dentro de transação e gera histórico de pedido", async () => {
    const collab = await createCollaborator({ name: "Mariana Compras", department: "Compras" });
    const p1 = await createProduct({
      sku: "PAR-001",
      name: "Parafuso M8",
      category: "Fixação",
      unit: "cx",
      minStock: 3,
      currentStock: 2,
    });
    const p2 = await createProduct({
      sku: "CAB-002",
      name: "Cabo 2,5mm",
      category: "Elétrica",
      unit: "m",
      minStock: 10,
      currentStock: 0,
    });

    const entry = await registerPurchaseEntry({
      supplier: "VoltMax",
      referenceCode: "NF-9001",
      notes: "Entrega parcial",
      responsibleId: collab.id,
      items: [
        { productId: p1.id, quantity: 5 },
        { productId: p2.id, quantity: 12.5 },
      ],
    });

    expect(entry.items).toHaveLength(2);
    expect(entry.responsibleName).toBe("Mariana Compras");

    const updated1 = await getProductById(p1.id);
    const updated2 = await getProductById(p2.id);
    expect(updated1.currentStock).toBe(7);
    expect(updated2.currentStock).toBe(12.5);
    expect(updated2.status).toBe("OK");

    const entries = await listPurchaseEntries(10);
    expect(entries).toHaveLength(1);
    expect(entries[0].referenceCode).toBe("NF-9001");
  });

  it("registra retirada válida e bloqueia retirada maior que o saldo", async () => {
    const collab = await createCollaborator({ name: "João Produção", department: "Produção" });
    const p = await createProduct({
      sku: "LIM-010",
      name: "Álcool Isopropílico",
      category: "Limpeza",
      unit: "L",
      minStock: 2,
      currentStock: 3.5,
    });

    const exit1 = await registerWithdrawal({
      productId: p.id,
      quantity: 1.25,
      collaboratorId: collab.id,
      reason: "Limpeza bancada",
    });

    expect(exit1.previousStock).toBe(3.5);
    expect(exit1.newStock).toBe(2.25);

    await expect(
      registerWithdrawal({
        productId: p.id,
        quantity: 3,
        collaboratorId: collab.id,
        reason: "Tentativa acima do saldo",
      })
    ).rejects.toThrow(InsufficientStockError);

    const after = await getProductById(p.id);
    expect(after.currentStock).toBe(2.25);
  });

  it("garante integridade atômica sob retiradas simultâneas concorrentes (zero saldo negativo)", async () => {
    const collab = await createCollaborator({ name: "Fernanda Manutenção" });
    const p = await createProduct({
      sku: "CONC-001",
      name: "Broca 8mm",
      category: "Ferramentas",
      unit: "un",
      minStock: 2,
      currentStock: 5,
    });

    // 8 concurrent attempts of 2 units each on a stock of 5:
    // strictly 2 must succeed (total withdrawn = 4), 6 must fail, final stock = 1.
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, idx) =>
        registerWithdrawal({
          productId: p.id,
          quantity: 2,
          collaboratorId: collab.id,
          reason: `Requisição simultânea #${idx + 1}`,
        })
      )
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(6);
    for (const rej of rejected) {
      expect(rej.reason).toBeInstanceOf(InsufficientStockError);
    }

    const finalProduct = await getProductById(p.id);
    expect(finalProduct.currentStock).toBe(1);
    expect(finalProduct.status).toBe("LOW");

    const exitMovements = await prisma.stockMovement.findMany({
      where: { productId: p.id, type: "EXIT" },
      orderBy: { createdAt: "asc" },
    });
    expect(exitMovements).toHaveLength(2);
  });
});
