import { Prisma } from "@prisma/client";
import { ensureSqliteReady, prisma } from "@/lib/prisma";
import { collaboratorCreateSchema, collaboratorUpdateSchema } from "@/lib/validators";
import type { CollaboratorDTO } from "@/types/inventory";

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class InsufficientStockError extends ServiceError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string) {
    super(message, 400);
  }
}

function toCollaboratorDTO(
  row: {
    id: string;
    name: string;
    department: string | null;
    badgeCode: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count?: { movements: number };
  }
): CollaboratorDTO {
  return {
    id: row.id,
    name: row.name,
    department: row.department,
    badgeCode: row.badgeCode,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    movementCount: row._count?.movements,
  };
}

export async function listCollaborators(options?: {
  includeInactive?: boolean;
}): Promise<CollaboratorDTO[]> {
  await ensureSqliteReady();

  const rows = await prisma.collaborator.findMany({
    where: options?.includeInactive ? undefined : { active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      _count: {
        select: { movements: true },
      },
    },
  });

  return rows.map(toCollaboratorDTO);
}

export async function createCollaborator(input: unknown): Promise<CollaboratorDTO> {
  await ensureSqliteReady();
  const parsed = collaboratorCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Dados de colaborador inválidos");
  }

  const data = parsed.data;
  const normalizedBadge = data.badgeCode ? data.badgeCode.toUpperCase() : null;

  try {
    const created = await prisma.collaborator.create({
      data: {
        name: data.name,
        department: data.department,
        badgeCode: normalizedBadge,
      },
      include: {
        _count: { select: { movements: true } },
      },
    });
    return toCollaboratorDTO(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError(`Já existe um colaborador com a matrícula/código ${normalizedBadge}.`);
    }
    throw err;
  }
}

export async function updateCollaborator(id: string, input: unknown): Promise<CollaboratorDTO> {
  await ensureSqliteReady();
  const parsed = collaboratorUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Dados de atualização inválidos");
  }

  const existing = await prisma.collaborator.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError("Colaborador não encontrado.");
  }

  const data = parsed.data;
  const normalizedBadge =
    data.badgeCode === undefined ? undefined : data.badgeCode ? data.badgeCode.toUpperCase() : null;

  try {
    const updated = await prisma.collaborator.update({
      where: { id },
      data: {
        name: data.name,
        department: data.department,
        badgeCode: normalizedBadge,
        active: data.active,
      },
      include: {
        _count: { select: { movements: true } },
      },
    });
    return toCollaboratorDTO(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError(`Matrícula/código ${normalizedBadge} já está em uso.`);
    }
    throw err;
  }
}
