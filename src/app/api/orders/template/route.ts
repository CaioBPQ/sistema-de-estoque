import { NextRequest, NextResponse } from "next/server";
import { requireActiveActor } from "@/app/api/_lib/actor-auth";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { loadOrderTemplateCatalog } from "@/lib/services/order-export-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireActiveActor(request);
    const catalog = await loadOrderTemplateCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
