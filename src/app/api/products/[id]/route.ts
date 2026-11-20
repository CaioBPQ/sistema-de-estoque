import { NextRequest, NextResponse } from "next/server";
import { requireManagerActor } from "@/app/api/_lib/actor-auth";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import {
  archiveProduct,
  getProductById,
  updateProduct,
} from "@/lib/services/inventory-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const product = await getProductById(params.id);
    return NextResponse.json({ product });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    await requireManagerActor(request);
    const body = await request.json();
    const product = await updateProduct(params.id, body);
    return NextResponse.json({ product });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    await requireManagerActor(request);
    const product = await archiveProduct(params.id);
    return NextResponse.json({ product });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
