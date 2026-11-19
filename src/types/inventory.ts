export type StockStatus = "OK" | "LOW" | "ZERO";

export type ProductStatusFilter = StockStatus | "ALL" | "IN_STOCK";

export type MovementType = "ENTRY" | "EXIT" | "IMPORT";

export interface ProductDTO {
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
  status: StockStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CollaboratorDTO {
  id: string;
  name: string;
  department: string | null;
  badgeCode: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  movementCount?: number;
}

export interface PurchaseEntryItemDTO {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
  quantity: number;
  previousStock: number;
  newStock: number;
}

export interface PurchaseEntryDTO {
  id: string;
  supplier: string;
  referenceCode: string | null;
  notes: string | null;
  receivedAt: string;
  responsibleId: string;
  responsibleName: string;
  items: PurchaseEntryItemDTO[];
  createdAt: string;
}

export interface StockMovementDTO {
  id: string;
  type: MovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string | null;
  productId: string;
  productSku: string;
  productName: string;
  productUnit: string;
  collaboratorId: string | null;
  collaboratorName: string | null;
  collaboratorDepartment: string | null;
  purchaseEntryId: string | null;
  purchaseReference: string | null;
  purchaseSupplier: string | null;
  createdAt: string;
}

export interface DashboardSummary {
  totalProducts: number;
  totalUnits: number;
  lowStockCount: number;
  zeroStockCount: number;
  todayMovementsCount: number;
  categories: string[];
}

export interface ProductsListResponse {
  products: ProductDTO[];
  summary: DashboardSummary;
}

export interface MovementsListResponse {
  movements: StockMovementDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export type ImportColumnKey =
  | "sku"
  | "name"
  | "category"
  | "weightGrams"
  | "unit"
  | "supplier"
  | "minStock"
  | "currentStock";

export type ImportColumnMapping = Record<ImportColumnKey, string | null>;

export type ImportConflictStrategy =
  | "SKIP"
  | "UPDATE_METADATA"
  | "REPLACE_STOCK"
  | "ADD_STOCK";

export interface ImportPreviewRow {
  rowNumber: number;
  sku: string;
  name: string;
  category: string;
  weightGrams: number | null;
  unit: string;
  supplier: string | null;
  minStock: number;
  currentStock: number;
  existsInDb: boolean;
  existingStock: number | null;
  errors: string[];
}

export interface ImportPreviewResponse {
  fileName: string;
  headers: string[];
  suggestedMapping: ImportColumnMapping;
  rawRowCount: number;
  rawRows: Record<string, string>[];
  previewRows: ImportPreviewRow[];
  validCount: number;
  errorCount: number;
  newCount: number;
  existingCount: number;
}

export interface ImportCommitRow {
  sku: string;
  name: string;
  category: string;
  weightGrams?: number | null;
  unit: string;
  supplier?: string | null;
  minStock: number;
  currentStock: number;
}

export interface ImportCommitPayload {
  rows: ImportCommitRow[];
  strategy: ImportConflictStrategy;
  collaboratorId?: string | null;
}

export interface ImportCommitResult {
  created: number;
  updated: number;
  skipped: number;
  movementsLogged: number;
}
