import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  sqliteConfigured?: Promise<void>;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Ensures SQLite runs in WAL mode with a 5s busy timeout to handle concurrent
 * stock entries and withdrawals without SQLITE_BUSY errors.
 */
export async function ensureSqliteReady(): Promise<void> {
  if (!globalForPrisma.sqliteConfigured) {
    globalForPrisma.sqliteConfigured = (async () => {
      await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
      await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
      await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON;");
    })().catch((err) => {
      globalForPrisma.sqliteConfigured = undefined;
      throw err;
    });
  }
  return globalForPrisma.sqliteConfigured;
}

let sqliteWriteQueue: Promise<void> = Promise.resolve();

/**
 * Serializes SQLite write transactions in-process so concurrent requests
 * do not contend on SQLite DEFERRED lock upgrades or exhaust busy_timeout.
 */
export async function runWithSqliteWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = sqliteWriteQueue;
  let release!: () => void;
  sqliteWriteQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}
