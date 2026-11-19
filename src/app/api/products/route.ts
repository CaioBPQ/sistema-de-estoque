import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { createProduct, listProducts } from "@/lib/services/inventory-service";
import type { ProductStatusFilter } from "@/types/inventory";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["ALL", "IN_STOCK", "OK", "LOW", "ZERO"]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;
    const rawStatus = searchParams.get("status") ?? "ALL";
    const status = ALLOWED_STATUSES.has(rawStatus)
      ? (rawStatus as ProductStatusFilter)
      : "ALL";

    const data = await listProducts({
      search: searchParams.get("search") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      status,
      includeInactive: searchParams.get("includeInactive") === "true",
    });

    return NextResponse.json(data);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const product = await createProduct(body);
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
