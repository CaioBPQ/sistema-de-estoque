import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { registerWithdrawal } from "@/lib/services/inventory-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const movement = await registerWithdrawal(body);
    return NextResponse.json({ movement }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
