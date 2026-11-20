import type { MovementType, StockStatus, UserRole } from "@/types/inventory";

const STOCK_STATUS_STYLES: Record<
  StockStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  OK: {
    label: "Disponível",
    badgeClass:
      "bg-[#ECFDF3] text-[#006B28] border border-[#009C3B]/40",
    dotClass: "bg-[#009C3B]",
  },
  LOW: {
    label: "Estoque Baixo",
    badgeClass:
      "bg-[#FEF3C7] text-[#111111] border border-[#D97706]",
    dotClass: "bg-[#D97706]",
  },
  ZERO: {
    label: "Indisponível",
    badgeClass:
      "bg-[#FEF2F2] text-[#991B1B] border border-[#DC2626]/40",
    dotClass: "bg-[#DC2626]",
  },
};

const MOVEMENT_TYPE_STYLES: Record<
  MovementType,
  { label: string; badgeClass: string }
> = {
  ENTRY: {
    label: "Entrada",
    badgeClass:
      "bg-[#ECFDF3] text-[#006B28] border border-[#009C3B]/40",
  },
  EXIT: {
    label: "Retirada",
    badgeClass:
      "bg-[#FEF2F2] text-[#991B1B] border border-[#DC2626]/40",
  },
  RETURN: {
    label: "Devolução",
    badgeClass:
      "bg-[#FEF3C7] text-[#111111] border border-[#D97706]",
  },
  IMPORT: {
    label: "Importação",
    badgeClass:
      "bg-[#111111] text-[#FFD700] border border-[#111111]",
  },
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const cfg = STOCK_STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-xs font-bold ${cfg.badgeClass}`}
    >
      <span className={`h-2 w-2 rounded-full ${cfg.dotClass}`} />
      {cfg.label}
    </span>
  );
}

export function MovementTypeBadge({ type }: { type: MovementType }) {
  const cfg = MOVEMENT_TYPE_STYLES[type];
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold ${cfg.badgeClass}`}
    >
      {cfg.label}
    </span>
  );
}

export function RoleBadge({ role }: { role: UserRole }) {
  const isManager = role === "MANAGER";
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-bold ${
        isManager
          ? "bg-[#111111] text-[#FFD700]"
          : "bg-[#FFD700] text-[#111111] border border-[#111111]/30"
      }`}
    >
      {isManager ? "Dono / Gestor" : "Funcionário"}
    </span>
  );
}
