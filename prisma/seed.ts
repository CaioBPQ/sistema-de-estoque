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
  const existingUsers = await prisma.collaborator.count();
  if (existingUsers === 0) {
    await prisma.collaborator.createMany({
      data: [
        { name: "Luiz", department: "Dono / Gestor", badgeCode: "GES-001", role: "MANAGER" },
        { name: "Mauro", department: "Operação / Volantes", badgeCode: "FUN-001", role: "EMPLOYEE" },
        { name: "Jean", department: "Operação / Volantes", badgeCode: "FUN-002", role: "EMPLOYEE" },
        { name: "Guilherme", department: "Operação / Volantes", badgeCode: "FUN-003", role: "EMPLOYEE" },
        { name: "Carlinho", department: "Operação / Volantes", badgeCode: "FUN-004", role: "EMPLOYEE" },
      ],
    });
    console.log("[seed] Perfis criados: Luiz (Gestor) e Mauro, Jean, Guilherme, Carlinho (Funcionários).");
  }

  const existingProducts = await prisma.product.count();
  if (existingProducts > 0) {
    console.log("[seed] Banco já possui volantes cadastrados. Pulando carga de produtos.");
    return;
  }

  console.log("[seed] Populando catálogo base de volantes Garfer...");

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
