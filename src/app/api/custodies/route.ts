import { NextRequest, NextResponse } from "next/server";
import { resolveOptionalActor } from "@/app/api/_lib/actor-auth";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { listCustodies } from "@/lib/services/inventory-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await resolveOptionalActor(request);
    const { searchParams } = request.nextUrl;
    const requestedCollab = searchParams.get("collaboratorId") || undefined;
    const productId = searchParams.get("productId") || undefined;

    const effectiveCollaboratorId =
      actor?.role === "EMPLOYEE" ? actor.id : requestedCollab;

    const custodies = await listCustodies({
      collaboratorId: effectiveCollaboratorId,
      productId,
    });
    return NextResponse.json({ custodies });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
