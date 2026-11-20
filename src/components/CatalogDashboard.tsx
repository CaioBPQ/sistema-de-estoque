"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  FileSpreadsheet,
  History,
  Info,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  UserCheck,
  XCircle,
} from "lucide-react";
import { useInventoryUI } from "@/components/AppShell";
import { StockStatusBadge } from "@/components/StatusBadge";
import { formatQuantity, formatWeight } from "@/lib/format";
import type {
  DashboardSummary,
  ProductCustodyDTO,
  ProductDTO,
  ProductStatusFilter,
} from "@/types/inventory";

const EMPTY_SUMMARY: DashboardSummary = {
  totalProducts: 0,
  totalUnits: 0,
  lowStockCount: 0,
  zeroStockCount: 0,
  todayMovementsCount: 0,
  categories: [],
};

export function CatalogDashboard() {
  const {
    refreshKey,
    triggerRefresh,
    activeActor,
    openWithdrawalModal,
    openReturnModal,
    openEntryModal,
    openProductModal,
    showToast,
  } = useInventoryUI();

  const isManager = activeActor?.role === "MANAGER";

  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [custodies, setCustodies] = useState<ProductCustodyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>("ALL");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (category !== "ALL") params.set("category", category);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (includeInactive) params.set("includeInactive", "true");

      const [prodRes, custodyRes] = await Promise.all([
        fetch(`/api/products?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/custodies", { cache: "no-store" }),
      ]);

      if (!prodRes.ok) {
        throw new Error("Não foi possível carregar o catálogo de volantes.");
      }
      const json = (await prodRes.json()) as {
        products: ProductDTO[];
        summary: DashboardSummary;
      };
      setProducts(json.products);
      setSummary(json.summary);

      if (custodyRes.ok) {
        const custodyJson = (await custodyRes.json()) as { custodies: ProductCustodyDTO[] };
        setCustodies(custodyJson.custodies);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar volantes.");
    } finally {
      setLoading(false);
    }
  }, [search, category, statusFilter, includeInactive]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts, refreshKey]);

  const myCustodies = useMemo(
    () =>
      activeActor
        ? custodies.filter((c) => c.collaboratorId === activeActor.id)
        : [],
    [custodies, activeActor]
  );

  const inUseByProduct = useMemo(() => {
    const map = new Map<string, ProductCustodyDTO[]>();
    for (const c of custodies) {
      const list = map.get(c.productId) ?? [];
      list.push(c);
      map.set(c.productId, list);
    }
    return map;
  }, [custodies]);

  const handleToggleActive = async (product: ProductDTO) => {
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !product.active }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Falha ao atualizar status do volante.");
      }
      setConfirmArchiveId(null);
      showToast(
        product.active
          ? `Volante ${product.name} arquivado (histórico preservado).`
          : `Volante ${product.name} reativado no catálogo.`
      );
      triggerRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro ao atualizar volante.", "error");
    }
  };

  const criticalItems = products.filter(
    (p) => p.active && (p.status === "ZERO" || p.status === "LOW")
  );
  const needsInitialCount = summary.totalProducts > 0 && summary.totalUnits === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Catálogo de Volantes & Saldo em Tempo Real
          </h1>
          <p className="text-sm text-slate-500">
            {isManager
              ? "Visão gerencial completa: estoque livre, unidades em uso pela equipe e ações administrativas."
              : `Modo Funcionário (${activeActor?.name}): consulte modelos disponíveis, registre retiradas e devoluções.`}
          </p>
        </div>

        {isManager && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/importacao"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Importar Planilha
            </Link>
            <button
              type="button"
              onClick={() => openProductModal(null, summary.categories)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Novo Volante
            </button>
          </div>
        )}
      </div>

      {/* My Active Custodies Card (Visible whenever current user holds steering wheels) */}
      {myCustodies.length > 0 && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
              <div>
                <p className="text-sm font-bold text-sky-950">
                  Volantes atualmente em posse de {activeActor?.name}
                </p>
                <p className="text-xs text-sky-800">
                  Clique em Devolver quando retornar o volante ao estoque.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {myCustodies.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-slate-900">
                    [{c.productSku}] {c.productName}
                  </div>
                  <div className="text-[11px] font-semibold text-sky-700">
                    Em uso: {formatQuantity(c.quantity, c.productUnit)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openReturnModal(c.productId)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-sky-700"
                >
                  <RotateCcw className="h-3 w-3" />
                  Devolver
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setStatusFilter("ALL")}
          className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-blue-300 ${
            statusFilter === "ALL" ? "border-blue-500 ring-2 ring-blue-500/15" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Modelos Ativos
            </span>
            <Boxes className="h-4 w-4 text-blue-600" />
          </div>
          <p className="tabular-nums mt-2 text-2xl font-bold text-slate-900">
            {summary.totalProducts}
          </p>
          <p className="tabular-nums mt-0.5 text-xs text-slate-500">
            {formatQuantity(summary.totalUnits)} volantes livres
          </p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter((s) => (s === "LOW" ? "ALL" : "LOW"))}
          className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-amber-300 ${
            statusFilter === "LOW" ? "border-amber-500 ring-2 ring-amber-500/20" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Estoque Baixo
            </span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <p className="tabular-nums mt-2 text-2xl font-bold text-amber-700">
            {summary.lowStockCount}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Abaixo ou igual ao mínimo</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter((s) => (s === "ZERO" ? "ALL" : "ZERO"))}
          className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-rose-300 ${
            statusFilter === "ZERO" ? "border-rose-500 ring-2 ring-rose-500/20" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-rose-700">
              Modelos Zerados
            </span>
            <XCircle className="h-4 w-4 text-rose-500" />
          </div>
          <p className="tabular-nums mt-2 text-2xl font-bold text-rose-700">
            {summary.zeroStockCount}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Sem saldo livre</p>
        </button>

        {isManager ? (
          <Link
            href="/movimentacoes"
            className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Movimentações Hoje
              </span>
              <History className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="tabular-nums mt-2 text-2xl font-bold text-slate-900">
              {summary.todayMovementsCount}
            </p>
            <p className="mt-0.5 text-xs font-medium text-blue-600">
              Ver relatórios por funcionário →
            </p>
          </Link>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Em Uso Com Você
              </span>
              <RotateCcw className="h-4 w-4 text-sky-600" />
            </div>
            <p className="tabular-nums mt-2 text-2xl font-bold text-sky-700">
              {formatQuantity(myCustodies.reduce((acc, c) => acc + c.quantity, 0))}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Unidades vinculadas ao seu perfil</p>
          </div>
        )}
      </div>

      {/* Onboarding Banner for Manager when catalog starts at 0 */}
      {isManager && needsInitialCount && statusFilter === "ALL" && !search ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div>
                <p className="text-sm font-bold text-blue-950">
                  Catálogo base de {summary.totalProducts} volantes carregado (saldos zerados)
                </p>
                <p className="text-xs text-blue-800">
                  As quantidades da planilha de pedidos não foram usadas como saldo. Lance a contagem
                  física ou chegada de peças via <strong>Entrada / Importar Excel</strong>.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openEntryModal()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Lançar Entrada / Pedido Excel
              </button>
              <Link
                href="/importacao"
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-white px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Importar Saldo Excel
              </Link>
            </div>
          </div>
        </div>
      ) : (
        isManager &&
        (summary.zeroStockCount > 0 || summary.lowStockCount > 0) &&
        statusFilter === "ALL" &&
        !search && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-bold text-amber-950">
                    Atenção para reposição de volantes
                  </p>
                  <p className="text-xs text-amber-800">
                    Há {summary.zeroStockCount} modelo(s) zerado(s) e {summary.lowStockCount} com
                    estoque baixo.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {criticalItems.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openEntryModal(item.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 shadow-sm ring-1 ring-amber-200 hover:bg-amber-100"
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />
                    Repor {item.sku}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      )}

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código (ex: VI0487), modelo (Gol, Onix) ou montadora..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="ALL">Todas as montadoras</option>
            {summary.categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProductStatusFilter)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="ALL">Todos os status</option>
            <option value="IN_STOCK">Com saldo (&gt; 0)</option>
            <option value="OK">Disponível</option>
            <option value="LOW">Estoque Baixo</option>
            <option value="ZERO">Zerado</option>
          </select>

          {isManager && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Mostrar arquivados
            </label>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Carregando catálogo de volantes...
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <PackageCheck className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-base font-semibold text-slate-800">
            Nenhum volante encontrado
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Ajuste os filtros ou selecione outro modelo.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-2 text-xs font-medium text-slate-500">
              Exibindo <strong className="text-slate-800">{products.length}</strong> modelo(s)
            </div>
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Código / Volante</th>
                  <th className="px-4 py-3">Montadora</th>
                  <th className="px-4 py-3 text-right">Peso</th>
                  <th className="px-4 py-3 text-right">Saldo Livre</th>
                  <th className="px-4 py-3 text-right">Mínimo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => {
                  const holders = inUseByProduct.get(product.id) ?? [];
                  const heldByMe = myCustodies.find((c) => c.productId === product.id);
                  return (
                    <tr
                      key={product.id}
                      className={`transition hover:bg-slate-50/70 ${
                        !product.active ? "bg-slate-50/50 opacity-60" : ""
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">{product.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-700">
                            {product.sku}
                          </span>
                          {product.supplier && <span>• {product.supplier}</span>}
                          {holders.length > 0 && (
                            <span className="rounded bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-800 ring-1 ring-sky-200">
                              Em uso:{" "}
                              {holders
                                .map((h) => `${h.collaboratorName} (${h.quantity})`)
                                .join(", ")}
                            </span>
                          )}
                          {!product.active && (
                            <span className="rounded bg-slate-200 px-1.5 py-0.5 font-semibold text-slate-700">
                              Arquivado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">{product.category}</td>
                      <td className="tabular-nums px-4 py-3.5 text-right text-xs text-slate-500">
                        {formatWeight(product.weightGrams)}
                      </td>
                      <td className="tabular-nums px-4 py-3.5 text-right text-base font-bold text-slate-900">
                        {formatQuantity(product.currentStock, product.unit)}
                      </td>
                      <td className="tabular-nums px-4 py-3.5 text-right text-slate-500">
                        {formatQuantity(product.minStock, product.unit)}
                      </td>
                      <td className="px-4 py-3.5">
                        <StockStatusBadge status={product.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={!product.active || product.currentStock <= 0}
                            onClick={() => openWithdrawalModal(product.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Registrar retirada deste volante"
                          >
                            <ArrowUpFromLine className="h-3.5 w-3.5" />
                            Retirar
                          </button>

                          {heldByMe && (
                            <button
                              type="button"
                              onClick={() => openReturnModal(product.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100"
                              title="Devolver volante em posse"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Devolver
                            </button>
                          )}

                          {isManager && (
                            <>
                              <button
                                type="button"
                                disabled={!product.active}
                                onClick={() => openEntryModal(product.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                                title="Registrar entrada deste volante"
                              >
                                <ArrowDownToLine className="h-3.5 w-3.5" />
                                Entrada
                              </button>
                              <button
                                type="button"
                                onClick={() => openProductModal(product, summary.categories)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Editar volante"
                                aria-label={`Editar ${product.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              {confirmArchiveId === product.id ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(product)}
                                  className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-bold text-white hover:bg-rose-700"
                                >
                                  Confirmar?
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    product.active
                                      ? setConfirmArchiveId(product.id)
                                      : handleToggleActive(product)
                                  }
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  title={product.active ? "Arquivar volante" : "Reativar volante"}
                                  aria-label={product.active ? "Arquivar volante" : "Reativar volante"}
                                >
                                  {product.active ? (
                                    <Archive className="h-4 w-4" />
                                  ) : (
                                    <ArchiveRestore className="h-4 w-4 text-blue-600" />
                                  )}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {products.map((product) => {
              const heldByMe = myCustodies.find((c) => c.productId === product.id);
              return (
                <div
                  key={product.id}
                  className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
                    !product.active ? "opacity-65" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                        {product.sku}
                      </span>
                      <h3 className="mt-1 text-base font-bold text-slate-900">{product.name}</h3>
                      <p className="text-xs text-slate-500">
                        {product.category}
                        {product.weightGrams !== null
                          ? ` • ${formatWeight(product.weightGrams)}`
                          : ""}
                      </p>
                    </div>
                    <StockStatusBadge status={product.status} />
                  </div>

                  <div className="mt-3 flex items-baseline justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-xs font-medium text-slate-500">
                      Mínimo: {formatQuantity(product.minStock, product.unit)}
                    </span>
                    <span className="tabular-nums text-lg font-bold text-slate-900">
                      {formatQuantity(product.currentStock, product.unit)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!product.active || product.currentStock <= 0}
                      onClick={() => openWithdrawalModal(product.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-600 py-2 text-xs font-bold text-white disabled:opacity-40"
                    >
                      <ArrowUpFromLine className="h-3.5 w-3.5" />
                      Retirar
                    </button>
                    {heldByMe && (
                      <button
                        type="button"
                        onClick={() => openReturnModal(product.id)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 py-2 text-xs font-bold text-sky-700"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Devolver
                      </button>
                    )}
                    {isManager && (
                      <>
                        <button
                          type="button"
                          disabled={!product.active}
                          onClick={() => openEntryModal(product.id)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 py-2 text-xs font-bold text-emerald-700 disabled:opacity-40"
                        >
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                          Entrada
                        </button>
                        <button
                          type="button"
                          onClick={() => openProductModal(product, summary.categories)}
                          className="rounded-xl border border-slate-200 p-2 text-slate-600"
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
