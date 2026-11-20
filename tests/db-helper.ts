import { execSync } from "node:child_process";
import { ensureSqliteReady, prisma } from "@/lib/prisma";

let schemaPushed = false;

export async function initTestDb(): Promise<void> {
  if (!schemaPushed) {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      stdio: "pipe",
      env: {
        ...process.env,
        DATABASE_URL: "file:./test.db",
      },
    });
    schemaPushed = true;
  }
  await ensureSqliteReady();
}

export async function resetTestDb(): Promise<void> {
  await prisma.stockMovement.deleteMany();
  await prisma.purchaseEntry.deleteMany();
  await prisma.productCustody.deleteMany();
  await prisma.product.deleteMany();
  await prisma.collaborator.deleteMany();
}
