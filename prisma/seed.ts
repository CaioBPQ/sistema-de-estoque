import { PrismaClient } from "@prisma/client";
import volantesGarfer from "./data/volantes-garfer.json";

const prisma = new PrismaClient();

interface GarferSteeringWheelSeed {
  sku: string;
  name: string;
  category: string;
  weightGrams: number;
  supplier: string;
  unit: string;
}

async function main() {
  const existingProducts = await prisma.product.count();
  if (existingProducts > 0) {
    console.log("[seed] Banco já possui volantes cadastrados. Pulando seed inicial.");
    return;
  }

  console.log("[seed] Populando catálogo base de volantes Garfer...");

  await prisma.collaborator.createMany({
    data: [
      { name: "Almoxarifado Geral", department: "Estoque", badgeCode: "EST-001" },
      { name: "Expedição", department: "Logística", badgeCode: "EXP-002" },
      { name: "Comercial", department: "Vendas / Troca", badgeCode: "COM-003" },
    ],
  });

  const items = volantesGarfer as GarferSteeringWheelSeed[];
  await prisma.product.createMany({
    data: items.map((item) => ({
      sku: item.sku,
      name: item.name,
      category: item.category,
      unit: item.unit,
      weightGrams: item.weightGrams,
      supplier: item.supplier,
      minStock: 2,
      currentStock: 0,
    })),
  });

  console.log(`[seed] ${items.length} volantes cadastrados com sucesso (saldo inicial 0 aguardando contagem/entradas).`);
}

main()
  .catch((err) => {
    console.error("[seed] Erro ao executar seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
