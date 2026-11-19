import type { MovementType, StockStatus } from "@/types/inventory";

const STOCK_STATUS_STYLES: Record<
  StockStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  OK: {
    label: "Disponível",
    badgeClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
    dotClass: "bg-emerald-500",
  },
  LOW: {
    label: "Estoque Baixo",
    badgeClass: "bg-amber-50 text-amber-800 ring-1 ring-amber-600/25",
    dotClass: "bg-amber-500",
  },
  ZERO: {
    label: "Zerado",
    badgeClass: "bg-rose-50 text-rose-700 ring-1 ring-rose-600/25",
    dotClass: "bg-rose-500",
  },
};

const MOVEMENT_TYPE_STYLES: Record<
  MovementType,
  { label: string; badgeClass: string }
> = {
  ENTRY: {
    label: "Entrada",
    badgeClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
  },
  EXIT: {
    label: "Retirada",
    badgeClass: "bg-orange-50 text-orange-800 ring-1 ring-orange-600/25",
  },
  IMPORT: {
    label: "Importação",
    badgeClass: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20",
  },
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const cfg = STOCK_STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.badgeClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
      {cfg.label}
    </span>
  );
}

export function MovementTypeBadge({ type }: { type: MovementType }) {
  const cfg = MOVEMENT_TYPE_STYLES[type];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.badgeClass}`}
    >
      {cfg.label}
    </span>
  );
}
