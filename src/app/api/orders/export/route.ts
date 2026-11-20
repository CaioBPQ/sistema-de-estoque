import { NextRequest, NextResponse } from "next/server";
import { requireActiveActor } from "@/app/api/_lib/actor-auth";
import { apiErrorResponse } from "@/app/api/_lib/error-response";
import { exportOrderToWorkbookBuffer } from "@/lib/services/order-export-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireActiveActor(request);
    const body = await request.json();
    const { buffer, fileName } = await exportOrderToWorkbookBuffer(body);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
