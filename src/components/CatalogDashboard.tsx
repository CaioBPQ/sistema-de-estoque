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
          <h1 className="text-2xl font-extrabold tracking-tight text-[#111111]">
            Catálogo de Volantes & Saldo em Tempo Real
          </h1>
          <p className="text-sm font-medium text-zinc-600">
            {isManager
              ? "Painel gerencial Grupo Volantes Vitória: estoque livre, peças em uso e alertas."
              : `Operador ${activeActor?.name}: consulte disponibilidade e registre retiradas ou devoluções.`}
          </p>
        </div>

        {isManager && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/importacao"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#111111] bg-white px-3.5 py-2 text-sm font-bold text-[#111111] shadow-sm hover:bg-[#F8F9FA]"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#009C3B]" />
              Importar Planilha
            </Link>
            <button
              type="button"
              onClick={() => openProductModal(null, summary.categories)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#111111] bg-[#FFD700] px-4 py-2 text-sm font-extrabold text-[#111111] shadow-sm hover:bg-[#F2C900]"
            >
              <Plus className="h-4 w-4" />
              Novo Volante
            </button>
          </div>
        )}
      </div>

      {/* My Active Custodies Card */}
      {myCustodies.length > 0 && (
        <div className="rounded-xl border-2 border-[#D97706] bg-[#FEF3C7]/70 p-4 shadow-sm">
          <div className="flex items-start gap-2.5">
            <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#111111]" />
            <div>
              <p className="text-sm font-extrabold text-[#111111]">
                Volantes em posse de {activeActor?.name}
              </p>
              <p className="text-xs font-medium text-zinc-800">
                Clique em Devolver quando o volante retornar ao estoque.
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {myCustodies.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[#111111]/20 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-extrabold text-[#111111]">
                    [{c.productSku}] {c.productName}
                  </div>
                  <div className="text-[11px] font-bold text-[#B45309]">
                    Em uso: {formatQuantity(c.quantity, c.productUnit)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openReturnModal(c.productId)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#111111] bg-[#FFD700] px-2.5 py-1.5 text-xs font-extrabold text-[#111111] hover:bg-[#F2C900]"
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
          className={`rounded-xl border-2 bg-white p-4 text-left shadow-sm transition ${
            statusFilter === "ALL"
              ? "border-[#111111] bg-[#FFFBEB]"
              : "border-zinc-200 hover:border-[#111111]/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-zinc-600">
              Modelos Ativos
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFD700] text-[#111111]">
              <Boxes className="h-4 w-4" />
            </span>
          </div>
          <p className="tabular-nums mt-2 text-2xl font-extrabold text-[#111111]">
            {summary.totalProducts}
          </p>
          <p className="tabular-nums mt-0.5 text-xs font-semibold text-zinc-600">
            {formatQuantity(summary.totalUnits)} volantes livres
          </p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter((s) => (s === "LOW" ? "ALL" : "LOW"))}
          className={`rounded-xl border-2 bg-white p-4 text-left shadow-sm transition ${
            statusFilter === "LOW"
              ? "border-[#D97706] bg-[#FEF3C7]/40"
              : "border-zinc-200 hover:border-[#D97706]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-[#92400E]">
              Estoque Baixo
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FEF3C7] text-[#D97706]">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </div>
          <p className="tabular-nums mt-2 text-2xl font-extrabold text-[#111111]">
            {summary.lowStockCount}
          </p>
          <p className="mt-0.5 text-xs font-medium text-zinc-600">Abaixo ou igual ao mínimo</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter((s) => (s === "ZERO" ? "ALL" : "ZERO"))}
          className={`rounded-xl border-2 bg-white p-4 text-left shadow-sm transition ${
            statusFilter === "ZERO"
              ? "border-[#DC2626] bg-[#FEF2F2]/60"
              : "border-zinc-200 hover:border-[#DC2626]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-[#DC2626]">
              Indisponíveis
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#DC2626]">
              <XCircle className="h-4 w-4" />
            </span>
          </div>
          <p className="tabular-nums mt-2 text-2xl font-extrabold text-[#DC2626]">
            {summary.zeroStockCount}
          </p>
          <p className="mt-0.5 text-xs font-medium text-zinc-600">Sem saldo livre</p>
        </button>

        {isManager ? (
          <Link
            href="/movimentacoes"
            className="rounded-xl border-2 border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-[#111111]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wide text-zinc-600">
                Movimentações Hoje
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ECFDF3] text-[#009C3B]">
                <History className="h-4 w-4" />
              </span>
            </div>
            <p className="tabular-nums mt-2 text-2xl font-extrabold text-[#111111]">
              {summary.todayMovementsCount}
            </p>
            <p className="mt-0.5 text-xs font-bold text-[#006B28]">
              Ver relatórios por funcionário →
            </p>
          </Link>
        ) : (
          <div className="rounded-xl border-2 border-zinc-200 bg-white p-4 text-left shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wide text-zinc-600">
                Em Uso Com Você
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FEF3C7] text-[#111111]">
                <RotateCcw className="h-4 w-4" />
              </span>
            </div>
            <p className="tabular-nums mt-2 text-2xl font-extrabold text-[#111111]">
              {formatQuantity(myCustodies.reduce((acc, c) => acc + c.quantity, 0))}
            </p>
            <p className="mt-0.5 text-xs font-medium text-zinc-600">
              Unidades vinculadas ao seu nome
            </p>
          </div>
        )}
      </div>

      {/* Onboarding Banner for Manager when catalog starts at 0 */}
      {isManager && needsInitialCount && statusFilter === "ALL" && !search ? (
        <div className="rounded-xl border-2 border-[#111111] bg-[#FFFBEB] p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#111111]" />
              <div>
                <p className="text-sm font-extrabold text-[#111111]">
                  Catálogo base de {summary.totalProducts} volantes carregado (saldos zerados)
                </p>
                <p className="text-xs font-medium text-zinc-700">
                  As quantidades da planilha de pedidos não foram usadas como saldo. Lance a contagem
                  ou chegada de peças via <strong>Entrada / Pedido Excel</strong>.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openEntryModal()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#111111] bg-[#009C3B] px-3 py-2 text-xs font-extrabold text-white hover:bg-[#008230]"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Lançar Entrada / Pedido Excel
              </button>
              <Link
                href="/importacao"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#111111] bg-[#FFD700] px-3 py-2 text-xs font-extrabold text-[#111111] hover:bg-[#F2C900]"
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
          <div className="rounded-xl border-2 border-[#D97706] bg-[#FEF3C7]/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#D97706]" />
                <div>
                  <p className="text-sm font-extrabold text-[#111111]">
                    Atenção para reposição de volantes
                  </p>
                  <p className="text-xs font-medium text-zinc-800">
                    Há {summary.zeroStockCount} modelo(s) indisponível(is) e {summary.lowStockCount}{" "}
                    com estoque baixo.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {criticalItems.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openEntryModal(item.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#111111]/30 bg-white px-2.5 py-1.5 text-xs font-bold text-[#111111] shadow-sm hover:bg-[#FFD700]"
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5 text-[#009C3B]" />
                    Repor {item.sku}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      )}

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-300 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código (ex: VI0487), modelo (Gol, Onix) ou montadora..."
            className="w-full rounded-lg border border-zinc-300 bg-[#F8F9FA] py-2 pl-9 pr-3 text-sm font-medium text-[#111111] outline-none focus:border-[#111111] focus:bg-white focus:ring-2 focus:ring-[#FFD700]/40"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-bold text-[#111111] outline-none focus:border-[#111111]"
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
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-bold text-[#111111] outline-none focus:border-[#111111]"
          >
            <option value="ALL">Todos os status</option>
            <option value="IN_STOCK">Com saldo (&gt; 0)</option>
            <option value="OK">Disponível</option>
            <option value="LOW">Estoque Baixo</option>
            <option value="ZERO">Indisponível</option>
          </select>

          {isManager && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-[#F8F9FA]">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="rounded border-zinc-400 text-[#111111] focus:ring-[#FFD700]"
              />
              Mostrar arquivados
            </label>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#DC2626] bg-[#FEF2F2] p-4 text-sm font-semibold text-[#991B1B]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-zinc-300 bg-white p-10 text-center text-sm font-semibold text-zinc-600">
          Carregando catálogo de volantes...
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-white p-10 text-center">
          <PackageCheck className="mx-auto h-10 w-10 text-zinc-400" />
          <p className="mt-2 text-base font-extrabold text-[#111111]">
            Nenhum volante encontrado
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Ajuste os filtros ou selecione outro modelo.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table — High Contrast Header (#111111 + #FFD700) & Zebra Stripes */}
          <div className="hidden overflow-hidden rounded-xl border-2 border-[#111111] bg-white shadow-sm md:block">
            <div className="flex items-center justify-between border-b border-zinc-200 bg-[#F8F9FA] px-4 py-2 text-xs font-bold text-zinc-700">
              <span>
                Exibindo <strong className="text-[#111111]">{products.length}</strong> modelo(s)
              </span>
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                Grupo Volantes Vitória
              </span>
            </div>
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#111111] text-xs font-extrabold uppercase tracking-wider text-[#FFD700]">
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
              <tbody className="divide-y divide-zinc-200">
                {products.map((product) => {
                  const holders = inUseByProduct.get(product.id) ?? [];
                  const heldByMe = myCustodies.find((c) => c.productId === product.id);
                  return (
                    <tr
                      key={product.id}
                      className={`odd:bg-white even:bg-[#F8F9FA] hover:bg-[#FFFBEB] ${
                        !product.active ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-[#111111]">{product.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                          <span className="rounded border border-[#111111]/20 bg-[#FFD700]/40 px-1.5 py-0.5 font-mono font-extrabold text-[#111111]">
                            {product.sku}
                          </span>
                          {product.supplier && <span>• {product.supplier}</span>}
                          {holders.length > 0 && (
                            <span className="rounded border border-[#D97706] bg-[#FEF3C7] px-2 py-0.5 font-bold text-[#111111]">
                              Em uso:{" "}
                              {holders
                                .map((h) => `${h.collaboratorName} (${h.quantity})`)
                                .join(", ")}
                            </span>
                          )}
                          {!product.active && (
                            <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-bold text-zinc-700">
                              Arquivado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-zinc-800">
                        {product.category}
                      </td>
                      <td className="tabular-nums px-4 py-3.5 text-right text-xs font-semibold text-zinc-600">
                        {formatWeight(product.weightGrams)}
                      </td>
                      <td className="tabular-nums px-4 py-3.5 text-right text-base font-extrabold text-[#111111]">
                        {formatQuantity(product.currentStock, product.unit)}
                      </td>
                      <td className="tabular-nums px-4 py-3.5 text-right font-medium text-zinc-600">
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
                            className="inline-flex items-center gap-1 rounded-lg bg-[#DC2626] px-2.5 py-1.5 text-xs font-extrabold text-white hover:bg-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-35"
                            title="Registrar retirada deste volante"
                          >
                            <ArrowUpFromLine className="h-3.5 w-3.5" />
                            Retirar
                          </button>

                          {heldByMe && (
                            <button
                              type="button"
                              onClick={() => openReturnModal(product.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#111111] bg-[#FFD700] px-2.5 py-1.5 text-xs font-extrabold text-[#111111] hover:bg-[#F2C900]"
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
                                className="inline-flex items-center gap-1 rounded-lg bg-[#009C3B] px-2.5 py-1.5 text-xs font-extrabold text-white hover:bg-[#008230] disabled:opacity-35"
                                title="Registrar entrada deste volante"
                              >
                                <ArrowDownToLine className="h-3.5 w-3.5" />
                                Entrada
                              </button>
                              <button
                                type="button"
                                onClick={() => openProductModal(product, summary.categories)}
                                className="rounded-lg border border-zinc-300 bg-white p-1.5 text-[#111111] hover:bg-[#FFD700]"
                                title="Editar volante"
                                aria-label={`Editar ${product.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              {confirmArchiveId === product.id ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(product)}
                                  className="rounded-lg bg-[#DC2626] px-2 py-1 text-xs font-extrabold text-white hover:bg-[#B91C1C]"
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
                                  className="rounded-lg border border-zinc-300 bg-white p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-[#111111]"
                                  title={product.active ? "Arquivar volante" : "Reativar volante"}
                                  aria-label={
                                    product.active ? "Arquivar volante" : "Reativar volante"
                                  }
                                >
                                  {product.active ? (
                                    <Archive className="h-4 w-4" />
                                  ) : (
                                    <ArchiveRestore className="h-4 w-4 text-[#009C3B]" />
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
                  className={`rounded-xl border border-zinc-300 bg-white p-4 shadow-sm ${
                    !product.active ? "opacity-65" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="rounded border border-[#111111]/20 bg-[#FFD700]/40 px-1.5 py-0.5 font-mono text-[11px] font-extrabold text-[#111111]">
                        {product.sku}
                      </span>
                      <h3 className="mt-1 text-base font-extrabold text-[#111111]">
                        {product.name}
                      </h3>
                      <p className="text-xs font-medium text-zinc-600">
                        {product.category}
                        {product.weightGrams !== null
                          ? ` • ${formatWeight(product.weightGrams)}`
                          : ""}
                      </p>
                    </div>
                    <StockStatusBadge status={product.status} />
                  </div>

                  <div className="mt-3 flex items-baseline justify-between rounded-lg bg-[#F8F9FA] px-3 py-2">
                    <span className="text-xs font-semibold text-zinc-600">
                      Mínimo: {formatQuantity(product.minStock, product.unit)}
                    </span>
                    <span className="tabular-nums text-lg font-extrabold text-[#111111]">
                      {formatQuantity(product.currentStock, product.unit)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!product.active || product.currentStock <= 0}
                      onClick={() => openWithdrawalModal(product.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#DC2626] py-2 text-xs font-extrabold text-white disabled:opacity-35"
                    >
                      <ArrowUpFromLine className="h-3.5 w-3.5" />
                      Retirar
                    </button>
                    {heldByMe && (
                      <button
                        type="button"
                        onClick={() => openReturnModal(product.id)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#111111] bg-[#FFD700] py-2 text-xs font-extrabold text-[#111111]"
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
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#009C3B] py-2 text-xs font-extrabold text-white disabled:opacity-35"
                        >
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                          Entrada
                        </button>
                        <button
                          type="button"
                          onClick={() => openProductModal(product, summary.categories)}
                          className="rounded-lg border border-zinc-300 p-2 text-[#111111]"
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
