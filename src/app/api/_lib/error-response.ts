import { NextResponse } from "next/server";
import { ServiceError } from "@/lib/services/collaborator-service";

export function apiErrorResponse(err: unknown): NextResponse {
  if (err instanceof ServiceError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }
  console.error("[API Error]", err);
  return NextResponse.json(
    { error: "Erro interno ao processar a solicitação." },
    { status: 500 }
  );
}
