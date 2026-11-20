import { NextRequest, NextResponse } from "next/server";
import { requireActiveActor } from "@/app/api/_lib/actor-auth";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { ForbiddenError } from "@/lib/services/collaborator-service";
import { registerWithdrawal } from "@/lib/services/inventory-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireActiveActor(request);
    const body = (await request.json()) as Record<string, unknown>;

    if (
      actor.role === "EMPLOYEE" &&
      typeof body?.collaboratorId === "string" &&
      body.collaboratorId.trim().length > 0 &&
      body.collaboratorId !== actor.id
    ) {
      throw new ForbiddenError(
        `Funcionários só podem registrar retiradas vinculadas ao próprio nome (${actor.name}).`
      );
    }

    const movement = await registerWithdrawal({
      ...body,
      collaboratorId: actor.role === "EMPLOYEE" ? actor.id : body?.collaboratorId || actor.id,
    });
    return NextResponse.json({ movement }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
