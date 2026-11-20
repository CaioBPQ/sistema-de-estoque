import { NextRequest } from "next/server";
import {
  ForbiddenError,
  ValidationError,
  getCollaboratorById,
} from "@/lib/services/collaborator-service";
import type { CollaboratorDTO } from "@/types/inventory";

export async function resolveOptionalActor(
  request: NextRequest
): Promise<CollaboratorDTO | null> {
  const actorId =
    request.headers.get("x-actor-id")?.trim() ||
    request.cookies.get("stockflow-actor-id")?.value?.trim();

  if (!actorId) {
    return null;
  }

  const actor = await getCollaboratorById(actorId);
  if (!actor || !actor.active) {
    throw new ForbiddenError("Perfil de usuário inválido ou inativo.");
  }
  return actor;
}

export async function requireActiveActor(request: NextRequest): Promise<CollaboratorDTO> {
  const actor = await resolveOptionalActor(request);
  if (!actor) {
    throw new ValidationError("Selecione seu perfil de usuário antes de realizar esta ação.");
  }
  return actor;
}

export async function requireManagerActor(request: NextRequest): Promise<CollaboratorDTO> {
  const actor = await requireActiveActor(request);
  if (actor.role !== "MANAGER") {
    throw new ForbiddenError(
      `Acesso restrito ao Dono/Gestor (Luiz). O perfil ${actor.name} possui permissão apenas para retiradas e devoluções.`
    );
  }
  return actor;
}
