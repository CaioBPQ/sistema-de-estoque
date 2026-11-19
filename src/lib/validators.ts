import { z } from "zod";
import type { StockStatus } from "@/types/inventory";

/**
 * Rounds quantities to at most 3 decimal places to avoid IEEE-754 noise
 * when operating with fractional units (kg, L, m).
 */
export function roundQuantity(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function normalizeSku(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase();
}

export function computeStockStatus(currentStock: number, minStock: number): StockStatus {
  if (currentStock <= 0) {
    return "ZERO";
  }
  if (currentStock <= minStock) {
    return "LOW";
  }
  return "OK";
}

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .optional()
    .nullable()
    .transform((val) => {
      if (val === undefined || val === null) return null;
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : null;
    });

const positiveQty = z.coerce
  .number({ invalid_type_error: "Informe uma quantidade numérica válida" })
  .finite("Quantidade inválida")
  .positive("A quantidade deve ser maior que zero")
  .max(1_000_000, "Quantidade excede o limite permitido")
  .transform((val) => roundQuantity(val));

const nonNegativeQty = z.coerce
  .number({ invalid_type_error: "Informe um valor numérico válido" })
  .finite("Valor inválido")
  .min(0, "O valor não pode ser negativo")
  .max(1_000_000, "Valor excede o limite permitido")
  .transform((val) => roundQuantity(val));

const optionalNonNegativeWeight = z
  .union([
    z.coerce
      .number({ invalid_type_error: "Peso deve ser um número válido" })
      .finite("Peso inválido")
      .min(0, "O peso não pode ser negativo")
      .max(100_000, "Peso excede o limite permitido")
      .transform((val) => roundQuantity(val, 2)),
    z.null(),
  ])
  .optional();

export const productCreateSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(2, "Código/SKU deve ter pelo menos 2 caracteres")
    .max(60, "Código/SKU muito longo")
    .transform(normalizeSku),
  name: z.string().trim().min(2, "Descrição do volante obrigatória").max(160),
  category: z.string().trim().min(2, "Montadora/Categoria obrigatória").max(80),
  unit: z.string().trim().min(1, "Unidade obrigatória").max(20).default("un"),
  weightGrams: optionalNonNegativeWeight,
  supplier: optionalTrimmedString(120),
  minStock: nonNegativeQty.default(0),
  currentStock: nonNegativeQty.default(0),
  collaboratorId: optionalTrimmedString(64),
});

export const productUpdateSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(2, "Código/SKU deve ter pelo menos 2 caracteres")
    .max(60)
    .transform(normalizeSku)
    .optional(),
  name: z.string().trim().min(2, "Descrição do volante obrigatória").max(160).optional(),
  category: z.string().trim().min(2, "Montadora/Categoria obrigatória").max(80).optional(),
  unit: z.string().trim().min(1, "Unidade obrigatória").max(20).optional(),
  weightGrams: optionalNonNegativeWeight,
  supplier: optionalTrimmedString(120),
  minStock: nonNegativeQty.optional(),
  active: z.boolean().optional(),
});

export const collaboratorCreateSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres").max(120),
  department: optionalTrimmedString(80),
  badgeCode: optionalTrimmedString(40),
});

export const collaboratorUpdateSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres").max(120).optional(),
  department: optionalTrimmedString(80),
  badgeCode: optionalTrimmedString(40),
  active: z.boolean().optional(),
});

export const purchaseEntryItemInputSchema = z.object({
  productId: z.string().trim().min(1, "Produto obrigatório"),
  quantity: positiveQty,
});

export const purchaseEntryCreateSchema = z.object({
  supplier: z.string().trim().min(2, "Fornecedor obrigatório").max(140),
  referenceCode: optionalTrimmedString(80),
  notes: optionalTrimmedString(400),
  receivedAt: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (val) => !val || !Number.isNaN(Date.parse(val)),
      "Data de recebimento inválida"
    ),
  responsibleId: z.string().trim().min(1, "Responsável pelo lançamento é obrigatório"),
  items: z
    .array(purchaseEntryItemInputSchema)
    .min(1, "Adicione pelo menos 1 produto à entrada")
    .refine(
      (items) => new Set(items.map((item) => item.productId)).size === items.length,
      "Não repita o mesmo produto na mesma entrada; some a quantidade em uma única linha"
    ),
});

export const withdrawalCreateSchema = z.object({
  productId: z.string().trim().min(1, "Selecione um produto"),
  quantity: positiveQty,
  collaboratorId: z.string().trim().min(1, "Informe quem está retirando o item"),
  reason: optionalTrimmedString(240),
});

export const movementFilterSchema = z.object({
  productId: z.string().trim().optional(),
  collaboratorId: z.string().trim().optional(),
  type: z.enum(["ALL", "ENTRY", "EXIT", "IMPORT"]).optional().default("ALL"),
  startDate: z
    .string()
    .trim()
    .optional()
    .refine((val) => !val || !Number.isNaN(Date.parse(val)), "Data inicial inválida"),
  endDate: z
    .string()
    .trim()
    .optional()
    .refine((val) => !val || !Number.isNaN(Date.parse(val)), "Data final inválida"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const importCommitRowSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "SKU obrigatório")
    .max(60)
    .transform(normalizeSku),
  name: z.string().trim().min(1, "Nome obrigatório").max(160),
  category: z.string().trim().min(1).max(80).default("Outros"),
  weightGrams: optionalNonNegativeWeight,
  unit: z.string().trim().min(1).max(20).default("un"),
  supplier: optionalTrimmedString(120),
  minStock: nonNegativeQty.default(0),
  currentStock: nonNegativeQty.default(0),
});

export const importCommitSchema = z.object({
  rows: z.array(importCommitRowSchema).min(1, "Nenhuma linha válida para importar").max(5000),
  strategy: z
    .enum(["SKIP", "UPDATE_METADATA", "REPLACE_STOCK", "ADD_STOCK"])
    .default("SKIP"),
  collaboratorId: optionalTrimmedString(64),
});
