import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { createCollaborator, listCollaborators } from "@/lib/services/collaborator-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";
    const collaborators = await listCollaborators({ includeInactive });
    return NextResponse.json({ collaborators });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const collaborator = await createCollaborator(body);
    return NextResponse.json({ collaborator }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
