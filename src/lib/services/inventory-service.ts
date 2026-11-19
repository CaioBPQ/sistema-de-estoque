import { Prisma } from "@prisma/client";
import { escapeCsvCell, formatDateTime } from "@/lib/format";
import { ensureSqliteReady, prisma, runWithSqliteWriteLock } from "@/lib/prisma";
import {
  ConflictError,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
} from "@/lib/services/collaborator-service";
import {
  computeStockStatus,
  movementFilterSchema,
  productCreateSchema,
  productUpdateSchema,
  purchaseEntryCreateSchema,
  roundQuantity,
  withdrawalCreateSchema,
} from "@/lib/validators";
import type {
  DashboardSummary,
  MovementType,
  MovementsListResponse,
  ProductDTO,
  ProductStatusFilter,
  ProductsListResponse,
  PurchaseEntryDTO,
  StockMovementDTO,
} from "@/types/inventory";

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isRetryableSqliteError(err: unknown): boolean {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2034" || err.code === "P2028")
  ) {
    return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("sqlite_busy") ||
      msg.includes("database is locked") ||
      msg.includes("transaction already closed")
    );
  }
  return false;
}

export async function withSqliteRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 6
): Promise<T> {
  return runWithSqliteWriteLock(async () => {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err) {
        attempt += 1;
        if (attempt >= maxAttempts || !isRetryableSqliteError(err)) {
          throw err;
        }
        const jitterMs = 15 + Math.floor(Math.random() * 35) * attempt;
        await new Promise((resolve) => setTimeout(resolve, jitterMs));
      }
    }
  });
}

export function toProductDTO(row: {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  weightGrams: number | null;
  supplier: string | null;
  minStock: number;
  currentStock: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ProductDTO {
  const minStock = roundQuantity(row.minStock);
  const currentStock = roundQuantity(row.currentStock);
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    weightGrams: row.weightGrams !== null ? roundQuantity(row.weightGrams, 2) : null,
    supplier: row.supplier,
    minStock,
    currentStock,
    active: row.active,
    status: computeStockStatus(currentStock, minStock),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMovementDTO(row: {
  id: string;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string | null;
  productId: string;
  collaboratorId: string | null;
  purchaseEntryId: string | null;
  createdAt: Date;
  product: { sku: string; name: string; unit: string };
  collaborator: { name: string; department: string | null } | null;
  purchaseEntry: { referenceCode: string | null; supplier: string } | null;
}): StockMovementDTO {
  return {
    id: row.id,
    type: row.type as MovementType,
    quantity: roundQuantity(row.quantity),
    previousStock: roundQuantity(row.previousStock),
    newStock: roundQuantity(row.newStock),
    reason: row.reason,
    productId: row.productId,
    productSku: row.product.sku,
    productName: row.product.name,
    productUnit: row.product.unit,
    collaboratorId: row.collaboratorId,
    collaboratorName: row.collaborator?.name ?? null,
    collaboratorDepartment: row.collaborator?.department ?? null,
    purchaseEntryId: row.purchaseEntryId,
    purchaseReference: row.purchaseEntry?.referenceCode ?? null,
    purchaseSupplier: row.purchaseEntry?.supplier ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listProducts(filters?: {
  search?: string;
  category?: string;
  status?: ProductStatusFilter;
  includeInactive?: boolean;
}): Promise<ProductsListResponse> {
  await ensureSqliteReady();

  const allActive = await prisma.product.findMany({
    where: filters?.includeInactive ? undefined : { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const todayMovementsCount = await prisma.stockMovement.count({
    where: { createdAt: { gte: startOfToday } },
  });

  const activeRows = allActive.filter((p) => p.active);
  const categories = Array.from(new Set(activeRows.map((p) => p.category))).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  let totalUnits = 0;
  let lowStockCount = 0;
  let zeroStockCount = 0;

  for (const item of activeRows) {
    totalUnits += item.currentStock;
    const status = computeStockStatus(item.currentStock, item.minStock);
    if (status === "LOW") lowStockCount += 1;
    if (status === "ZERO") zeroStockCount += 1;
  }

  const summary: DashboardSummary = {
    totalProducts: activeRows.length,
    totalUnits: roundQuantity(totalUnits),
    lowStockCount,
    zeroStockCount,
    todayMovementsCount,
    categories,
  };

  const searchTerm = filters?.search?.trim() ? normalizeText(filters.search.trim()) : null;
  const categoryFilter = filters?.category?.trim() || null;
  const statusFilter = filters?.status && filters.status !== "ALL" ? filters.status : null;

  const products = allActive
    .map(toProductDTO)
    .filter((product) => {
      if (categoryFilter && categoryFilter !== "ALL" && product.category !== categoryFilter) {
        return false;
      }
      if (statusFilter === "IN_STOCK") {
        if (product.currentStock <= 0) return false;
      } else if (statusFilter && product.status !== statusFilter) {
        return false;
      }
      if (searchTerm) {
        const haystack = normalizeText(
          `${product.name} ${product.sku} ${product.category} ${product.supplier ?? ""}`
        );
        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }
      return true;
    });

  return { products, summary };
}

export async function getProductById(id: string): Promise<ProductDTO> {
  await ensureSqliteReady();
  const row = await prisma.product.findUnique({ where: { id } });
  if (!row) {
    throw new NotFoundError("Produto não encontrado.");
  }
  return toProductDTO(row);
}

export async function createProduct(input: unknown): Promise<ProductDTO> {
  await ensureSqliteReady();
  const parsed = productCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Dados do produto inválidos");
  }

  const data = parsed.data;

  try {
    const created = await withSqliteRetry(() =>
      prisma.$transaction(async (tx) => {
        if (data.collaboratorId) {
          const collab = await tx.collaborator.findUnique({
            where: { id: data.collaboratorId },
          });
          if (!collab || !collab.active) {
            throw new ValidationError("Colaborador responsável inválido ou inativo.");
          }
        }

        const product = await tx.product.create({
          data: {
            sku: data.sku,
            name: data.name,
            category: data.category,
            unit: data.unit,
            weightGrams: data.weightGrams ?? null,
            supplier: data.supplier,
            minStock: data.minStock,
            currentStock: data.currentStock,
          },
        });

        if (data.currentStock > 0) {
          await tx.stockMovement.create({
            data: {
              type: "ENTRY",
              quantity: data.currentStock,
              previousStock: 0,
              newStock: data.currentStock,
              reason: "Saldo inicial no cadastro",
              productId: product.id,
              collaboratorId: data.collaboratorId ?? null,
            },
          });
        }

        return product;
      })
    );

    return toProductDTO(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError(`Já existe um produto cadastrado com o SKU ${data.sku}.`);
    }
    throw err;
  }
}

export async function updateProduct(id: string, input: unknown): Promise<ProductDTO> {
  await ensureSqliteReady();
  const parsed = productUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Dados de atualização inválidos");
  }

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError("Produto não encontrado.");
  }

  const data = parsed.data;

  try {
    const updated = await prisma.product.update({
      where: { id },
      data: {
        sku: data.sku,
        name: data.name,
        category: data.category,
        unit: data.unit,
        weightGrams: data.weightGrams,
        supplier: data.supplier,
        minStock: data.minStock,
        active: data.active,
      },
    });
    return toProductDTO(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError(`SKU ${data.sku} já está em uso por outro produto.`);
    }
    throw err;
  }
}

export async function archiveProduct(id: string): Promise<ProductDTO> {
  return updateProduct(id, { active: false });
}

export async function registerPurchaseEntry(input: unknown): Promise<PurchaseEntryDTO> {
  await ensureSqliteReady();
  const parsed = purchaseEntryCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Dados de entrada inválidos");
  }

  const data = parsed.data;
  const receivedAt = data.receivedAt ? new Date(data.receivedAt) : new Date();

  const responsible = await prisma.collaborator.findUnique({
    where: { id: data.responsibleId },
  });
  if (!responsible) {
    throw new NotFoundError("Colaborador responsável não encontrado.");
  }
  if (!responsible.active) {
    throw new ConflictError("Colaborador responsável está inativo.");
  }

  return withSqliteRetry(() =>
    prisma.$transaction(
      async (tx) => {
        // Acquire write lock immediately before reading product rows to avoid SQLite DEFERRED upgrade deadlocks.
        const entry = await tx.purchaseEntry.create({
          data: {
            supplier: data.supplier,
            referenceCode: data.referenceCode,
            notes: data.notes,
            receivedAt,
            responsibleId: responsible.id,
          },
        });

        const productIds = data.items.map((item) => item.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
        });

        const productMap = new Map(products.map((p) => [p.id, p]));
        for (const item of data.items) {
          const product = productMap.get(item.productId);
          if (!product) {
            throw new NotFoundError(`Produto (${item.productId}) não encontrado.`);
          }
          if (!product.active) {
            throw new ConflictError(`Produto ${product.name} está arquivado e não aceita entradas.`);
          }
        }

        const createdItems = [];
        for (const item of data.items) {
          const updatedProduct = await tx.product.update({
            where: { id: item.productId },
            data: {
              currentStock: { increment: item.quantity },
            },
          });

          const newStock = roundQuantity(updatedProduct.currentStock);
          const previousStock = roundQuantity(newStock - item.quantity);

          if (newStock !== updatedProduct.currentStock) {
            await tx.product.update({
              where: { id: item.productId },
              data: { currentStock: newStock },
            });
          }

          const reasonParts = [
            data.referenceCode ? `Entrada ${data.referenceCode}` : "Entrada de mercadoria",
            data.supplier,
          ];

          const movement = await tx.stockMovement.create({
            data: {
              type: "ENTRY",
              quantity: item.quantity,
              previousStock,
              newStock,
              reason: reasonParts.join(" • "),
              productId: updatedProduct.id,
              collaboratorId: responsible.id,
              purchaseEntryId: entry.id,
            },
          });

          createdItems.push({
            id: movement.id,
            productId: updatedProduct.id,
            productName: updatedProduct.name,
            productSku: updatedProduct.sku,
            productUnit: updatedProduct.unit,
            quantity: item.quantity,
            previousStock,
            newStock,
          });
        }

        return {
          id: entry.id,
          supplier: entry.supplier,
          referenceCode: entry.referenceCode,
          notes: entry.notes,
          receivedAt: entry.receivedAt.toISOString(),
          responsibleId: responsible.id,
          responsibleName: responsible.name,
          items: createdItems,
          createdAt: entry.createdAt.toISOString(),
        };
      },
      { maxWait: 10000, timeout: 15000 }
    )
  );
}

export async function registerWithdrawal(input: unknown): Promise<StockMovementDTO> {
  await ensureSqliteReady();
  const parsed = withdrawalCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Dados da retirada inválidos");
  }

  const data = parsed.data;

  const collaborator = await prisma.collaborator.findUnique({
    where: { id: data.collaboratorId },
  });
  if (!collaborator) {
    throw new NotFoundError("Colaborador informado não foi encontrado.");
  }
  if (!collaborator.active) {
    throw new ConflictError("Colaborador inativo não pode registrar retiradas.");
  }

  return withSqliteRetry(() =>
    prisma.$transaction(
      async (tx) => {
        // First operation in transaction is a conditional write so SQLite acquires RESERVED lock immediately
        // without DEFERRED read-to-write upgrade deadlocks under concurrent requests.
        const updateResult = await tx.product.updateMany({
          where: {
            id: data.productId,
            active: true,
            currentStock: { gte: data.quantity },
          },
          data: {
            currentStock: { decrement: data.quantity },
          },
        });

        if (updateResult.count === 0) {
          const existing = await tx.product.findUnique({
            where: { id: data.productId },
          });
          if (!existing) {
            throw new NotFoundError("Produto não encontrado.");
          }
          if (!existing.active) {
            throw new ConflictError("Produto arquivado não permite retiradas.");
          }
          throw new InsufficientStockError(
            `Saldo insuficiente para ${existing.name}. Disponível: ${roundQuantity(existing.currentStock)} ${existing.unit}, solicitado: ${data.quantity} ${existing.unit}.`
          );
        }

        const afterProduct = await tx.product.findUniqueOrThrow({
          where: { id: data.productId },
        });

        const newStock = roundQuantity(afterProduct.currentStock);
        const previousStock = roundQuantity(newStock + data.quantity);

        if (newStock !== afterProduct.currentStock) {
          await tx.product.update({
            where: { id: data.productId },
            data: { currentStock: newStock },
          });
        }

        const movement = await tx.stockMovement.create({
          data: {
            type: "EXIT",
            quantity: data.quantity,
            previousStock,
            newStock,
            reason: data.reason,
            productId: afterProduct.id,
            collaboratorId: collaborator.id,
          },
          include: {
            product: { select: { sku: true, name: true, unit: true } },
            collaborator: { select: { name: true, department: true } },
            purchaseEntry: { select: { referenceCode: true, supplier: true } },
          },
        });

        return toMovementDTO(movement);
      },
      { maxWait: 10000, timeout: 15000 }
    )
  );
}

export async function listPurchaseEntries(limit = 50): Promise<PurchaseEntryDTO[]> {
  await ensureSqliteReady();
  const safeLimit = Math.min(Math.max(1, limit), 200);

  const entries = await prisma.purchaseEntry.findMany({
    take: safeLimit,
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    include: {
      responsible: { select: { id: true, name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: { select: { id: true, name: true, sku: true, unit: true } },
        },
      },
    },
  });

  return entries.map((entry) => ({
    id: entry.id,
    supplier: entry.supplier,
    referenceCode: entry.referenceCode,
    notes: entry.notes,
    receivedAt: entry.receivedAt.toISOString(),
    responsibleId: entry.responsible.id,
    responsibleName: entry.responsible.name,
    items: entry.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      productSku: item.product.sku,
      productUnit: item.product.unit,
      quantity: roundQuantity(item.quantity),
      previousStock: roundQuantity(item.previousStock),
      newStock: roundQuantity(item.newStock),
    })),
    createdAt: entry.createdAt.toISOString(),
  }));
}

function buildMovementWhere(filter: {
  productId?: string;
  collaboratorId?: string;
  type: "ALL" | "ENTRY" | "EXIT" | "IMPORT";
  startDate?: string;
  endDate?: string;
}): Prisma.StockMovementWhereInput {
  const where: Prisma.StockMovementWhereInput = {};

  if (filter.productId) {
    where.productId = filter.productId;
  }
  if (filter.collaboratorId) {
    where.collaboratorId = filter.collaboratorId;
  }
  if (filter.type !== "ALL") {
    where.type = filter.type;
  }

  if (filter.startDate || filter.endDate) {
    where.createdAt = {};
    if (filter.startDate) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(filter.startDate)) {
        const [y, m, d] = filter.startDate.split("-").map(Number);
        where.createdAt.gte = new Date(y, m - 1, d, 0, 0, 0, 0);
      } else {
        where.createdAt.gte = new Date(filter.startDate);
      }
    }
    if (filter.endDate) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(filter.endDate)) {
        const [y, m, d] = filter.endDate.split("-").map(Number);
        where.createdAt.lte = new Date(y, m - 1, d, 23, 59, 59, 999);
      } else {
        where.createdAt.lte = new Date(filter.endDate);
      }
    }
  }

  return where;
}

export async function listMovements(rawFilter: unknown): Promise<MovementsListResponse> {
  await ensureSqliteReady();
  const parsed = movementFilterSchema.safeParse(rawFilter);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Filtros de auditoria inválidos");
  }

  const filter = parsed.data;
  const where = buildMovementWhere(filter);
  const skip = (filter.page - 1) * filter.pageSize;

  const [total, rows] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      skip,
      take: filter.pageSize,
      orderBy: [{ createdAt: "desc" }],
      include: {
        product: { select: { sku: true, name: true, unit: true } },
        collaborator: { select: { name: true, department: true } },
        purchaseEntry: { select: { referenceCode: true, supplier: true } },
      },
    }),
  ]);

  return {
    movements: rows.map(toMovementDTO),
    total,
    page: filter.page,
    pageSize: filter.pageSize,
  };
}

export async function exportMovementsCsv(rawFilter: unknown): Promise<string> {
  await ensureSqliteReady();
  const parsed = movementFilterSchema.safeParse({
    ...(typeof rawFilter === "object" && rawFilter !== null ? rawFilter : {}),
    page: 1,
    pageSize: 200,
  });
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Filtros de auditoria inválidos");
  }

  const where = buildMovementWhere(parsed.data);
  const rows = await prisma.stockMovement.findMany({
    where,
    take: 5000,
    orderBy: [{ createdAt: "desc" }],
    include: {
      product: { select: { sku: true, name: true, unit: true } },
      collaborator: { select: { name: true, department: true } },
      purchaseEntry: { select: { referenceCode: true, supplier: true } },
    },
  });
  const movements = rows.map(toMovementDTO);

  const typeLabel: Record<MovementType, string> = {
    ENTRY: "Entrada",
    EXIT: "Saída",
    IMPORT: "Importação",
  };

  const header = [
    "Data/Hora",
    "Tipo",
    "SKU",
    "Produto",
    "Quantidade",
    "Unidade",
    "Saldo Anterior",
    "Saldo Novo",
    "Colaborador / Responsável",
    "Motivo / Referência",
  ].join(";");

  const lines = movements.map((m) =>
    [
      escapeCsvCell(formatDateTime(m.createdAt)),
      escapeCsvCell(typeLabel[m.type]),
      escapeCsvCell(m.productSku),
      escapeCsvCell(m.productName),
      escapeCsvCell(m.quantity),
      escapeCsvCell(m.productUnit),
      escapeCsvCell(m.previousStock),
      escapeCsvCell(m.newStock),
      escapeCsvCell(m.collaboratorName ?? "Sistema / Importação"),
      escapeCsvCell(m.reason ?? m.purchaseReference ?? ""),
    ].join(";")
  );

  return `\uFEFF${[header, ...lines].join("\r\n")}`;
}
