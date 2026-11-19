import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { updateCollaborator } from "@/lib/services/collaborator-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const collaborator = await updateCollaborator(params.id, body);
    return NextResponse.json({ collaborator });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
