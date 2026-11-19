import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { exportMovementsCsv, listMovements } from "@/lib/services/inventory-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;
    const filter = {
      productId: searchParams.get("productId") || undefined,
      collaboratorId: searchParams.get("collaboratorId") || undefined,
      type: searchParams.get("type") || "ALL",
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      page: searchParams.get("page") || "1",
      pageSize: searchParams.get("pageSize") || "50",
    };

    if (searchParams.get("format") === "csv") {
      const csv = await exportMovementsCsv(filter);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="auditoria-movimentacoes.csv"',
          "Cache-Control": "no-store",
        },
      });
    }

    const result = await listMovements(filter);
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
