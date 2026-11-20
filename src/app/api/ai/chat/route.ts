import { NextRequest, NextResponse } from "next/server";
import { requireManagerActor } from "@/app/api/_lib/actor-auth";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { queryInventoryAssistant } from "@/lib/services/ai-assistant-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireManagerActor(request);
    const body = await request.json();
    const response = await queryInventoryAssistant(body);
    return NextResponse.json(response);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
