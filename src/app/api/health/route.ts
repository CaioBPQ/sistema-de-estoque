import { NextResponse } from "next/server";
import { ensureSqliteReady, prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await ensureSqliteReady();
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      database: "sqlite",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Healthcheck Error]", err);
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 });
  }
}
