"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FilterX, History } from "lucide-react";
import { useInventoryUI } from "@/components/AppShell";
import { MovementTypeBadge } from "@/components/StatusBadge";
import { formatDateTime, formatQuantity } from "@/lib/format";
import type { CollaboratorDTO, ProductDTO, StockMovementDTO } from "@/types/inventory";

export function AuditTimelineView() {
  const { refreshKey } = useInventoryUI();

  const [movements, setMovements] = useState<StockMovementDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorDTO[]>([]);

  const [productId, setProductId] = useState("");
  const [collaboratorId, setCollaboratorId] = useState("");
  const [type, setType] = useState<"ALL" | "ENTRY" | "EXIT" | "IMPORT">("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [refreshKey]);

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

  const loadMovements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildQueryParams(true);
      const res = await fetch(`/api/movements?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Falha ao carregar log de auditoria.");
      const json = (await res.json()) as {
        movements: StockMovementDTO[];
        total: number;
      };
      setMovements(json.movements);
      setTotal(json.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar movimentações.");
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements, refreshKey]);

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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Log de Auditoria & Movimentações
          </h1>
          <p className="text-sm text-slate-500">
            Histórico imutável de quem retirou ou recebeu cada produto, com saldo anterior e novo.
          </p>
        </div>

        <a
          href={exportUrl}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          Exportar CSV Filtrado
        </a>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Produto
          </label>
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="">Todos os produtos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.sku}] {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Colaborador
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
              setType(e.target.value as "ALL" | "ENTRY" | "EXIT" | "IMPORT");
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="ALL">Todos</option>
            <option value="EXIT">Saída / Retirada</option>
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
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Data / Hora</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3 text-right">Qtd</th>
                  <th className="px-4 py-3 text-right">Saldo (Ant → Novo)</th>
                  <th className="px-4 py-3">Quem pegou / Resp.</th>
                  <th className="px-4 py-3">Motivo / Ref.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <MovementTypeBadge type={m.type} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{m.productName}</div>
                      <span className="font-mono text-[11px] text-slate-500">{m.productSku}</span>
                    </td>
                    <td
                      className={`tabular-nums px-4 py-3 text-right font-bold ${
                        m.type === "EXIT" ? "text-orange-700" : "text-emerald-700"
                      }`}
                    >
                      {m.type === "EXIT" ? "-" : "+"}
                      {formatQuantity(m.quantity, m.productUnit)}
                    </td>
                    <td className="tabular-nums px-4 py-3 text-right text-xs text-slate-600">
                      {formatQuantity(m.previousStock)} →{" "}
                      <strong className="text-slate-900">
                        {formatQuantity(m.newStock, m.productUnit)}
                      </strong>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">
                        {m.collaboratorName ?? "Sistema / Importação"}
                      </div>
                      {m.collaboratorDepartment && (
                        <div className="text-xs text-slate-500">{m.collaboratorDepartment}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
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
                      m.type === "EXIT" ? "text-orange-700" : "text-emerald-700"
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
