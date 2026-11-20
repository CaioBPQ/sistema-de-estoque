import { NextRequest, NextResponse } from "next/server";
import { requireActiveActor } from "@/app/api/_lib/actor-auth";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { ForbiddenError } from "@/lib/services/collaborator-service";
import { exportMovementsCsv, listMovements } from "@/lib/services/inventory-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireActiveActor(request);
    const { searchParams } = request.nextUrl;

    if (actor.role === "EMPLOYEE" && searchParams.get("format") === "csv") {
      throw new ForbiddenError("Exportação de relatórios CSV é restrita ao Gestor (Luiz).");
    }

    const filter = {
      productId: searchParams.get("productId") || undefined,
      collaboratorId:
        actor.role === "EMPLOYEE" ? actor.id : searchParams.get("collaboratorId") || undefined,
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
