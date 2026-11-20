import { NextRequest, NextResponse } from "next/server";
import { requireManagerActor } from "@/app/api/_lib/actor-auth";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { listPurchaseEntries, registerPurchaseEntry } from "@/lib/services/inventory-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireManagerActor(request);
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
    const actor = await requireManagerActor(request);
    const body = (await request.json()) as Record<string, unknown>;
    const entry = await registerPurchaseEntry({
      ...body,
      responsibleId: body?.responsibleId ?? actor.id,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
