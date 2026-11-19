import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existingProducts = await prisma.product.count();
  if (existingProducts > 0) {
    console.log("[seed] Banco já possui produtos cadastrados. Pulando seed inicial.");
    return;
  }

  console.log("[seed] Populando dados iniciais do Sistema de Estoque...");

  const collaborators = await Promise.all([
    prisma.collaborator.create({
      data: { name: "Carlos Almeida", department: "Almoxarifado", badgeCode: "ALM-001" },
    }),
    prisma.collaborator.create({
      data: { name: "Fernanda Costa", department: "Manutenção", badgeCode: "MAN-014" },
    }),
    prisma.collaborator.create({
      data: { name: "João Pedro Silva", department: "Produção", badgeCode: "PRD-022" },
    }),
    prisma.collaborator.create({
      data: { name: "Mariana Oliveira", department: "Compras / Logística", badgeCode: "CMP-005" },
    }),
  ]);

  const [carlos, fernanda, joao, mariana] = collaborators;

  const products = await Promise.all([
    prisma.product.create({
      data: {
        sku: "EPI-LUV-001",
        name: "Luva de Proteção Nitrílica (Par)",
        category: "EPIs",
        unit: "par",
        supplier: "SegurPro Distribuidora",
        minStock: 20,
        currentStock: 45,
      },
    }),
    prisma.product.create({
      data: {
        sku: "EPI-OCU-002",
        name: "Óculos de Segurança Incolor",
        category: "EPIs",
        unit: "un",
        supplier: "SegurPro Distribuidora",
        minStock: 15,
        currentStock: 8, // Estoque baixo
      },
    }),
    prisma.product.create({
      data: {
        sku: "FER-FUR-010",
        name: "Broca Aço Rápido HSS 8mm",
        category: "Ferramentas",
        unit: "un",
        supplier: "Ferragens Brasil Ltda",
        minStock: 10,
        currentStock: 0, // Zerado
      },
    }),
    prisma.product.create({
      data: {
        sku: "ELE-CAB-025",
        name: "Cabo Flexível 2,5mm Preto",
        category: "Elétrica",
        unit: "m",
        supplier: "VoltMax Materiais",
        minStock: 50,
        currentStock: 180,
      },
    }),
    prisma.product.create({
      data: {
        sku: "FIX-PAR-104",
        name: "Parafuso Sextavado M8x40mm (Cx c/ 100)",
        category: "Fixação",
        unit: "cx",
        supplier: "Ferragens Brasil Ltda",
        minStock: 5,
        currentStock: 4, // Estoque baixo
      },
    }),
    prisma.product.create({
      data: {
        sku: "LIM-ALC-003",
        name: "Álcool Isopropílico 1L",
        category: "Limpeza Técnica",
        unit: "L",
        supplier: "Química Industrial Sul",
        minStock: 6,
        currentStock: 14,
      },
    }),
    prisma.product.create({
      data: {
        sku: "ESC-PAP-001",
        name: "Papel Sulfite A4 75g (Resma 500 fls)",
        category: "Escritório",
        unit: "pct",
        supplier: "Papelaria Corporativa",
        minStock: 8,
        currentStock: 22,
      },
    }),
  ]);

  const [luva, oculos, broca, cabo, parafuso, alcool, papel] = products;

  const entry1 = await prisma.purchaseEntry.create({
    data: {
      supplier: "SegurPro Distribuidora",
      referenceCode: "NF-004812",
      notes: "Reposição mensal de EPIs",
      responsibleId: mariana.id,
      receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
    },
  });

  const entry2 = await prisma.purchaseEntry.create({
    data: {
      supplier: "VoltMax Materiais",
      referenceCode: "PC-2026-089",
      notes: "Material para manutenção elétrica do galpão B",
      responsibleId: carlos.id,
      receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
  });

  await prisma.stockMovement.createMany({
    data: [
      {
        type: "ENTRY",
        quantity: 50,
        previousStock: 0,
        newStock: 50,
        reason: "Entrada NF-004812",
        productId: luva.id,
        collaboratorId: mariana.id,
        purchaseEntryId: entry1.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
      },
      {
        type: "ENTRY",
        quantity: 12,
        previousStock: 0,
        newStock: 12,
        reason: "Entrada NF-004812",
        productId: oculos.id,
        collaboratorId: mariana.id,
        purchaseEntryId: entry1.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
      },
      {
        type: "ENTRY",
        quantity: 200,
        previousStock: 0,
        newStock: 200,
        reason: "Entrada PC-2026-089",
        productId: cabo.id,
        collaboratorId: carlos.id,
        purchaseEntryId: entry2.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      },
      {
        type: "IMPORT",
        quantity: 6,
        previousStock: 0,
        newStock: 6,
        reason: "Carga inicial de inventário",
        productId: parafuso.id,
        collaboratorId: carlos.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
      },
      {
        type: "IMPORT",
        quantity: 14,
        previousStock: 0,
        newStock: 14,
        reason: "Carga inicial de inventário",
        productId: alcool.id,
        collaboratorId: carlos.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
      },
      {
        type: "IMPORT",
        quantity: 22,
        previousStock: 0,
        newStock: 22,
        reason: "Carga inicial de inventário",
        productId: papel.id,
        collaboratorId: carlos.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
      },
      {
        type: "EXIT",
        quantity: 5,
        previousStock: 50,
        newStock: 45,
        reason: "Equipe Linha 1 - Turno Manhã",
        productId: luva.id,
        collaboratorId: joao.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
      },
      {
        type: "EXIT",
        quantity: 4,
        previousStock: 12,
        newStock: 8,
        reason: "Visitantes e novos operadores",
        productId: oculos.id,
        collaboratorId: fernanda.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
      },
      {
        type: "EXIT",
        quantity: 20,
        previousStock: 200,
        newStock: 180,
        reason: "Painel elétrico Galpão B",
        productId: cabo.id,
        collaboratorId: fernanda.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
      },
      {
        type: "EXIT",
        quantity: 2,
        previousStock: 6,
        newStock: 4,
        reason: "Montagem de bancada",
        productId: parafuso.id,
        collaboratorId: joao.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      },
      {
        type: "IMPORT",
        quantity: 2,
        previousStock: 0,
        newStock: 2,
        reason: "Carga inicial de inventário",
        productId: broca.id,
        collaboratorId: carlos.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
      },
      {
        type: "EXIT",
        quantity: 2,
        previousStock: 2,
        newStock: 0,
        reason: "Manutenção corretiva prensa 02",
        productId: broca.id,
        collaboratorId: fernanda.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 1),
      },
    ],
  });

  console.log("[seed] Dados iniciais criados com sucesso.");
}

main()
  .catch((err) => {
    console.error("[seed] Erro ao executar seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
