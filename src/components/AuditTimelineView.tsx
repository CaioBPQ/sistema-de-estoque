"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FilterX,
  History,
  Lock,
  Users,
} from "lucide-react";
import { useInventoryUI } from "@/components/AppShell";
import { MovementTypeBadge, RoleBadge } from "@/components/StatusBadge";
import { formatDateTime, formatQuantity } from "@/lib/format";
import type {
  CollaboratorDTO,
  ManagerReportDTO,
  MovementType,
  ProductDTO,
  StockMovementDTO,
} from "@/types/inventory";

export function AuditTimelineView() {
  const { activeActor, refreshKey } = useInventoryUI();
  const isManager = activeActor?.role === "MANAGER";

  const [movements, setMovements] = useState<StockMovementDTO[]>([]);
  const [report, setReport] = useState<ManagerReportDTO | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorDTO[]>([]);

  const [productId, setProductId] = useState("");
  const [collaboratorId, setCollaboratorId] = useState("");
  const [type, setType] = useState<"ALL" | MovementType>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isManager) return;
    Promise.all([
      fetch("/api/products?includeInactive=true"),
      fetch("/api/collaborators?includeInactive=true"),
    ])
      .then(async ([prodRes, collabRes]) => {
        if (prodRes.ok) {
          const p = (await prodRes.json()) as { products: ProductDTO[] };
          setProducts(p.products);
        }
        if (collabRes.ok) {
          const c = (await collabRes.json()) as { collaborators: CollaboratorDTO[] };
          setCollaborators(c.collaborators);
        }
      })
      .catch(() => {
        // Non-blocking filter metadata fetch
      });
  }, [refreshKey, isManager]);

  const buildQueryParams = useCallback(
    (includePaging = true) => {
      const params = new URLSearchParams();
      if (productId) params.set("productId", productId);
      if (collaboratorId) params.set("collaboratorId", collaboratorId);
      if (type !== "ALL") params.set("type", type);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (includePaging) {
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
      }
      return params;
    },
    [productId, collaboratorId, type, startDate, endDate, page]
  );

  const loadData = useCallback(async () => {
    if (!isManager) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = buildQueryParams(true);
      const reportParams = new URLSearchParams();
      if (startDate) reportParams.set("startDate", startDate);
      if (endDate) reportParams.set("endDate", endDate);

      const [movRes, repRes] = await Promise.all([
        fetch(`/api/movements?${params.toString()}`, { cache: "no-store" }),
        fetch(`/api/reports?${reportParams.toString()}`, { cache: "no-store" }),
      ]);

      if (!movRes.ok) throw new Error("Falha ao carregar log de auditoria.");
      const json = (await movRes.json()) as {
        movements: StockMovementDTO[];
        total: number;
      };
      setMovements(json.movements);
      setTotal(json.total);

      if (repRes.ok) {
        const repJson = (await repRes.json()) as ManagerReportDTO;
        setReport(repJson);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar movimentações.");
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams, isManager, startDate, endDate]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshKey]);

  if (!isManager) {
    return (
      <div className="rounded-xl border-2 border-[#D97706] bg-[#FEF3C7] p-8 text-center">
        <Lock className="mx-auto h-10 w-10 text-[#111111]" />
        <h2 className="mt-3 text-lg font-extrabold text-[#111111]">
          Relatórios administrativos restritos ao Gestor (Luiz)
        </h2>
        <p className="mt-1 text-sm font-medium text-zinc-800">
          O painel de entradas, saídas gerais e histórico por funcionário é exclusivo do Dono/Gestor.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-lg border border-[#111111] bg-[#FFD700] px-4 py-2 text-xs font-extrabold text-[#111111]"
        >
          Voltar ao Catálogo de Volantes
        </Link>
      </div>
    );
  }

  const resetFilters = () => {
    setProductId("");
    setCollaboratorId("");
    setType("ALL");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const exportUrl = `/api/movements?${buildQueryParams(false).toString()}&format=csv`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#111111]">
            Relatórios Gerais & Auditoria por Funcionário
          </h1>
          <p className="text-sm font-medium text-zinc-600">
            Dashboard gerencial de entradas, retiradas, devoluções e posse atual de toda a equipe.
          </p>
        </div>

        <a
          href={exportUrl}
          className="inline-flex items-center gap-2 rounded-lg border border-[#111111] bg-[#FFD700] px-4 py-2 text-sm font-extrabold text-[#111111] shadow-sm hover:bg-[#F2C900]"
        >
          <Download className="h-4 w-4" />
          Exportar CSV Filtrado
        </a>
      </div>

      {/* General Report Summary */}
      {report && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-xl border-2 border-[#009C3B]/40 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-extrabold uppercase text-[#006B28]">Entradas</span>
              <p className="tabular-nums mt-1 text-2xl font-extrabold text-[#006B28]">
                +{formatQuantity(report.totals.enteredUnits)}
              </p>
              <p className="text-xs font-medium text-zinc-600">
                {report.totals.entriesCount} lançamentos
              </p>
            </div>
            <div className="rounded-xl border-2 border-[#DC2626]/40 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-extrabold uppercase text-[#DC2626]">Retiradas</span>
              <p className="tabular-nums mt-1 text-2xl font-extrabold text-[#DC2626]">
                -{formatQuantity(report.totals.withdrawnUnits)}
              </p>
              <p className="text-xs font-medium text-zinc-600">
                {report.totals.withdrawalsCount} saídas
              </p>
            </div>
            <div className="rounded-xl border-2 border-zinc-300 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-extrabold uppercase text-zinc-700">Devoluções</span>
              <p className="tabular-nums mt-1 text-2xl font-extrabold text-[#111111]">
                +{formatQuantity(report.totals.returnedUnits)}
              </p>
              <p className="text-xs font-medium text-zinc-600">
                {report.totals.returnsCount} retornos
              </p>
            </div>
            <div className="rounded-xl border-2 border-[#D97706] bg-[#FEF3C7]/60 p-4 shadow-sm">
              <span className="text-[11px] font-extrabold uppercase text-[#111111]">
                Em Uso na Equipe
              </span>
              <p className="tabular-nums mt-1 text-2xl font-extrabold text-[#111111]">
                {formatQuantity(report.totals.totalInUseUnits)}
              </p>
              <p className="text-xs font-bold text-[#92400E]">Em posse no momento</p>
            </div>
            <div className="rounded-xl border-2 border-[#111111] bg-[#FFD700] p-4 shadow-sm">
              <span className="text-[11px] font-extrabold uppercase text-[#111111]">
                Livres no Estoque
              </span>
              <p className="tabular-nums mt-1 text-2xl font-extrabold text-[#111111]">
                {formatQuantity(report.totals.totalFreeUnits)}
              </p>
              <p className="text-xs font-bold text-[#111111]/80">Disponíveis agora</p>
            </div>
          </div>

          {/* Per-Employee Report */}
          <div className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#111111]" />
              <h2 className="text-sm font-extrabold text-[#111111]">
                Movimentações e Posse Atual por Usuário (clique para filtrar histórico)
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {report.byEmployee.map((emp) => {
                const selected = collaboratorId === emp.collaboratorId;
                return (
                  <button
                    key={emp.collaboratorId}
                    type="button"
                    onClick={() => {
                      setCollaboratorId((prev) =>
                        prev === emp.collaboratorId ? "" : emp.collaboratorId
                      );
                      setPage(1);
                    }}
                    className={`rounded-xl border-2 p-3 text-left transition ${
                      selected
                        ? "border-[#111111] bg-[#FFFBEB] shadow-sm"
                        : "border-zinc-200 hover:border-[#111111]/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-extrabold text-[#111111]">{emp.collaboratorName}</span>
                      <RoleBadge role={emp.role} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
                      <div>
                        <span className="block text-zinc-500">Retirou</span>
                        <strong className="tabular-nums text-[#DC2626]">
                          {formatQuantity(emp.withdrawnUnits)}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-zinc-500">Devolveu</span>
                        <strong className="tabular-nums text-[#006B28]">
                          {formatQuantity(emp.returnedUnits)}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-zinc-500">Em uso</span>
                        <strong className="tabular-nums text-[#111111]">
                          {formatQuantity(emp.inUseUnits)}
                        </strong>
                      </div>
                    </div>
                    {emp.activeCustodies.length > 0 && (
                      <div className="mt-2 border-t border-zinc-200 pt-1.5 text-[10px] font-bold text-zinc-700">
                        {emp.activeCustodies
                          .slice(0, 2)
                          .map((c) => `${c.productSku} (${c.quantity})`)
                          .join(", ")}
                        {emp.activeCustodies.length > 2 ? "..." : ""}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Volante
          </label>
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="">Todos os volantes</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.sku}] {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Usuário
          </label>
          <select
            value={collaboratorId}
            onChange={(e) => {
              setCollaboratorId(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="">Todos</option>
            {collaborators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Tipo
          </label>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as "ALL" | MovementType);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="ALL">Todos</option>
            <option value="EXIT">Retirada</option>
            <option value="RETURN">Devolução</option>
            <option value="ENTRY">Entrada / Compra</option>
            <option value="IMPORT">Importação</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            De
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Até
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            title="Limpar filtros"
          >
            <FilterX className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Carregando linha do tempo...
        </div>
      ) : movements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <History className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-base font-semibold text-slate-800">
            Nenhuma movimentação encontrada
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Tente ampliar o período ou limpar os filtros aplicados.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border-2 border-[#111111] bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#111111] text-xs font-extrabold uppercase tracking-wider text-[#FFD700]">
                <tr>
                  <th className="px-4 py-3">Data / Hora</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Volante</th>
                  <th className="px-4 py-3 text-right">Qtd</th>
                  <th className="px-4 py-3 text-right">Saldo (Ant → Novo)</th>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Motivo / Ref.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {movements.map((m) => (
                  <tr
                    key={m.id}
                    className="odd:bg-white even:bg-[#F8F9FA] hover:bg-[#FFFBEB]"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-zinc-600">
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <MovementTypeBadge type={m.type} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#111111]">{m.productName}</div>
                      <span className="font-mono text-[11px] font-bold text-zinc-600">
                        {m.productSku}
                      </span>
                    </td>
                    <td
                      className={`tabular-nums px-4 py-3 text-right font-extrabold ${
                        m.type === "EXIT"
                          ? "text-[#DC2626]"
                          : m.type === "RETURN"
                            ? "text-[#B45309]"
                            : "text-[#006B28]"
                      }`}
                    >
                      {m.type === "EXIT" ? "-" : "+"}
                      {formatQuantity(m.quantity, m.productUnit)}
                    </td>
                    <td className="tabular-nums px-4 py-3 text-right text-xs text-zinc-600">
                      {formatQuantity(m.previousStock)} →{" "}
                      <strong className="text-[#111111]">
                        {formatQuantity(m.newStock, m.productUnit)}
                      </strong>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#111111]">
                        {m.collaboratorName ?? "Sistema / Importação"}
                      </div>
                      {m.collaboratorDepartment && (
                        <div className="text-xs text-zinc-500">{m.collaboratorDepartment}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-600">
                      {m.reason ?? m.purchaseReference ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {movements.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <MovementTypeBadge type={m.type} />
                  <span className="text-xs text-slate-500">{formatDateTime(m.createdAt)}</span>
                </div>
                <div className="mt-2 font-bold text-slate-900">{m.productName}</div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-xs text-slate-600">
                    {m.collaboratorName ?? "Sistema / Importação"}
                  </span>
                  <span
                    className={`tabular-nums font-bold ${
                      m.type === "EXIT"
                        ? "text-orange-700"
                        : m.type === "RETURN"
                          ? "text-sky-700"
                          : "text-emerald-700"
                    }`}
                  >
                    {m.type === "EXIT" ? "-" : "+"}
                    {formatQuantity(m.quantity, m.productUnit)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
                  <span>{m.reason ?? m.purchaseReference ?? "Sem observação"}</span>
                  <span className="tabular-nums">
                    {formatQuantity(m.previousStock)} → {formatQuantity(m.newStock)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
            <span>
              Mostrando página <strong>{page}</strong> de <strong>{totalPages}</strong> ({total}{" "}
              registros)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Próxima
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
