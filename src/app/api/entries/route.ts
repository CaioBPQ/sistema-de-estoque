import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { listPurchaseEntries, registerPurchaseEntry } from "@/lib/services/inventory-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
    const entries = await listPurchaseEntries(limit);
    return NextResponse.json({ entries });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const entry = await registerPurchaseEntry(body);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
