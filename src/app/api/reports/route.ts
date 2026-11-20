import { NextRequest, NextResponse } from "next/server";
import { requireManagerActor } from "@/app/api/_lib/actor-auth";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { getManagerReport } from "@/lib/services/inventory-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireManagerActor(request);
    const { searchParams } = request.nextUrl;
    const report = await getManagerReport({
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });
    return NextResponse.json(report);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
