"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  CopyCheck,
  Download,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  Scale,
  Search,
  Wallet,
} from "lucide-react";
import { useInventoryUI } from "@/components/AppShell";
import { formatQuantity, formatWeight } from "@/lib/format";
import type {
  OrderExportItemInput,
  OrderHeaderFields,
  OrderTemplateCatalogItem,
  OrderTemplateResponse,
} from "@/types/inventory";

interface RowInputValues {
  ped: string;
  ret: string;
  real: string;
  valor: string;
}

const EMPTY_HEADER: OrderHeaderFields = {
  cliente: "",
  tipo: "",
  obs: "",
  dataInicial: "",
  dataFinal: "",
  comercial: "",
  expedicao: "",
  hora: "",
  horaFinal: "",
};

function parsePositiveInput(raw: string | undefined): number {
  if (!raw) return 0;
  const normalized = raw.trim().replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatKgFromGrams(grams: number): string {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(grams / 1000)} kg`;
}

function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseFilenameFromHeader(contentDisposition: string | null): string {
  if (!contentDisposition) {
    return `PEDIDO_VOLANTES_${new Date().toISOString().slice(0, 10)}.xlsx`;
  }
  const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return match?.[1] ?? `PEDIDO_VOLANTES_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export function OrderBuilderView() {
  const { showToast } = useInventoryUI();

  const [catalog, setCatalog] = useState<OrderTemplateCatalogItem[]>([]);
  const [templateInfo, setTemplateInfo] = useState<{
    templateName: string;
    sheetName: string;
    firstCatalogRow: number;
    lastCatalogRow: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [header, setHeader] = useState<OrderHeaderFields>(EMPTY_HEADER);
  const [rowInputs, setRowInputs] = useState<Record<number, RowInputValues>>({});

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [filterMode, setFilterMode] = useState<"ALL" | "WITH_QTY">("ALL");
  const [exporting, setExporting] = useState(false);

  const loadTemplate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/template", { cache: "no-store" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? "Não foi possível carregar o molde oficial de pedidos.");
      }
      const data = (await res.json()) as OrderTemplateResponse;
      setCatalog(data.items);
      setTemplateInfo({
        templateName: data.templateName,
        sheetName: data.sheetName,
        firstCatalogRow: data.firstCatalogRow,
        lastCatalogRow: data.lastCatalogRow,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar catálogo de pedidos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplate();
  }, [loadTemplate]);

  const categories = useMemo(() => {
    return Array.from(new Set(catalog.map((item) => item.category))).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
  }, [catalog]);

  const updateRowField = useCallback(
    (rowNumber: number, field: keyof RowInputValues, value: string) => {
      setRowInputs((prev) => {
        const current = prev[rowNumber] ?? { ped: "", ret: "", real: "", valor: "" };
        const updated: RowInputValues = { ...current, [field]: value };
        if (!updated.ped && !updated.ret && !updated.real && !updated.valor) {
          const next = { ...prev };
          delete next[rowNumber];
          return next;
        }
        return { ...prev, [rowNumber]: updated };
      });
    },
    []
  );

  const totals = useMemo(() => {
    let totalPed = 0;
    let totalRet = 0;
    let totalSub = 0;
    let totalReal = 0;
    let totalWeightGrams = 0;
    let totalValue = 0;
    let activeLineCount = 0;
    let hasSubWithoutReal = false;

    for (const item of catalog) {
      const vals = rowInputs[item.rowNumber];
      if (!vals) continue;

      const ped = parsePositiveInput(vals.ped);
      const ret = parsePositiveInput(vals.ret);
      const real = parsePositiveInput(vals.real);
      const valor = parsePositiveInput(vals.valor);
      const sub = ped + ret;

      if (ped > 0 || ret > 0 || real > 0) {
        activeLineCount += 1;
      }
      if (sub > 0 && real === 0) {
        hasSubWithoutReal = true;
      }

      totalPed += ped;
      totalRet += ret;
      totalSub += sub;
      totalReal += real;
      totalWeightGrams += item.weightGrams * sub;
      totalValue += real * valor;
    }

    return {
      totalPed,
      totalRet,
      totalSub,
      totalReal,
      totalWeightGrams,
      totalValue,
      activeLineCount,
      hasSubWithoutReal,
    };
  }, [catalog, rowInputs]);

  const filteredItems = useMemo(() => {
    const query = normalizeSearchText(search.trim());
    return catalog.filter((item) => {
      if (categoryFilter !== "ALL" && item.category !== categoryFilter) {
        return false;
      }

      const vals = rowInputs[item.rowNumber];
      const ped = parsePositiveInput(vals?.ped);
      const ret = parsePositiveInput(vals?.ret);
      const real = parsePositiveInput(vals?.real);

      if (filterMode === "WITH_QTY" && ped <= 0 && ret <= 0 && real <= 0) {
        return false;
      }

      if (!query) return true;
      const haySku = normalizeSearchText(item.sku);
      const hayDesc = normalizeSearchText(item.description);
      const hayCat = normalizeSearchText(item.category);
      return haySku.includes(query) || hayDesc.includes(query) || hayCat.includes(query);
    });
  }, [catalog, search, categoryFilter, filterMode, rowInputs]);

  const handleMirrorSubToReal = () => {
    setRowInputs((prev) => {
      const next: Record<number, RowInputValues> = { ...prev };
      for (const [rowKey, vals] of Object.entries(prev)) {
        const rowNum = Number(rowKey);
        const sub = parsePositiveInput(vals.ped) + parsePositiveInput(vals.ret);
        if (sub > 0 && parsePositiveInput(vals.real) === 0) {
          next[rowNum] = {
            ...vals,
            real: String(sub),
          };
        }
      }
      return next;
    });
    showToast("Coluna REAL preenchida com base no SUB (PED + RET).");
  };

  const handleClearOrder = () => {
    setHeader(EMPTY_HEADER);
    setRowInputs({});
    setFilterMode("ALL");
    showToast("Formulário e quantidades do pedido zerados.");
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const payloadItems: OrderExportItemInput[] = [];
      for (const item of catalog) {
        const vals = rowInputs[item.rowNumber];
        if (!vals) continue;
        const ped = parsePositiveInput(vals.ped);
        const ret = parsePositiveInput(vals.ret);
        const real = parsePositiveInput(vals.real);
        const valor = parsePositiveInput(vals.valor);
        if (ped > 0 || ret > 0 || real > 0 || valor > 0) {
          payloadItems.push({
            rowNumber: item.rowNumber,
            ped: ped > 0 ? ped : null,
            ret: ret > 0 ? ret : null,
            real: real > 0 ? real : null,
            valor: valor > 0 ? valor : null,
          });
        }
      }

      const res = await fetch("/api/orders/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          header,
          items: payloadItems,
        }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? "Falha ao gerar arquivo Excel do pedido.");
      }

      const blob = await res.blob();
      const fileName = parseFilenameFromHeader(res.headers.get("Content-Disposition"));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      showToast(`Planilha ${fileName} exportada preservando fórmulas e abas originais!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro ao exportar pedido.", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-[#111111]">
              Criação e Exportação de Pedidos
            </h1>
            <span className="rounded-md border border-[#111111]/20 bg-[#FFD700] px-2 py-0.5 text-xs font-extrabold uppercase text-[#111111]">
              Molde Oficial Garfer
            </span>
          </div>
          <p className="text-sm text-zinc-600">
            Monte seu pedido com os 235 modelos oficiais e exporte o arquivo{" "}
            <span className="font-semibold text-[#111111]">.xlsx</span> preservando fórmulas,
            mesclagens e a aba CONFERÊNCIA intactas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleClearOrder}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#111111] bg-white px-3.5 py-2 text-sm font-bold text-[#111111] transition hover:bg-zinc-100"
          >
            <RotateCcw className="h-4 w-4" />
            Limpar
          </button>

          <button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={loading || exporting}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-[#111111] bg-[#FFD700] px-4 py-2 text-sm font-extrabold text-[#111111] shadow-sm transition hover:bg-[#FFDE00] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Gerando Excel..." : "Exportar Pedido (Excel)"}
          </button>
        </div>
      </div>

      {/* Real-time Totals KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border-2 border-[#111111] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-600">
              Peças Pedidas (PED)
            </span>
            <span className="rounded-lg bg-[#FFD700] p-1.5 text-[#111111]">
              <ClipboardList className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#111111]">
              {formatQuantity(totals.totalPed)}
            </span>
            <span className="text-xs font-semibold text-zinc-600">
              ({totals.activeLineCount} {totals.activeLineCount === 1 ? "modelo" : "modelos"})
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-zinc-600">
            RET: <strong>{formatQuantity(totals.totalRet)}</strong> • SUB:{" "}
            <strong className="text-[#111111]">{formatQuantity(totals.totalSub)}</strong>
          </p>
        </div>

        <div className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-600">
              Peso Total Estimado
            </span>
            <span className="rounded-lg bg-[#ECFDF5] p-1.5 text-[#009C3B]">
              <Scale className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-[#111111]">
            {formatKgFromGrams(totals.totalWeightGrams)}
          </div>
          <p className="mt-1 text-xs font-medium text-zinc-600">
            Planilha (Coluna I = B×G):{" "}
            <strong className="text-[#111111]">{formatWeight(totals.totalWeightGrams)}</strong>
          </p>
        </div>

        <div className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-600">
              Conferência Real (REAL)
            </span>
            <span className="rounded-lg bg-[#FFFBEB] p-1.5 text-[#D97706]">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-2xl font-black text-[#111111]">
              {formatQuantity(totals.totalReal)}
            </span>
            {totals.hasSubWithoutReal && (
              <button
                type="button"
                onClick={handleMirrorSubToReal}
                title="Copiar SUB (PED + RET) para a coluna REAL nos itens preenchidos"
                className="inline-flex items-center gap-1 rounded-md border border-[#111111] bg-[#FFD700]/40 px-2 py-1 text-[11px] font-extrabold text-[#111111] hover:bg-[#FFD700]"
              >
                <CopyCheck className="h-3 w-3" />
                SUB → REAL
              </button>
            )}
          </div>
          <p className="mt-1 text-xs font-medium text-zinc-600">
            Coluna H da planilha oficial
          </p>
        </div>

        <div className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-600">
              Valor Total (TOTAL = REAL×VALOR)
            </span>
            <span className="rounded-lg bg-[#ECFDF5] p-1.5 text-[#009C3B]">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-[#009C3B]">
            {formatCurrencyBRL(totals.totalValue)}
          </div>
          <p className="mt-1 text-xs font-medium text-zinc-600">
            Soma da Coluna K (K243)
          </p>
        </div>
      </div>

      {/* Order Header Metadata Form (Rows 3-5 of Excel Template) */}
      <section className="overflow-hidden rounded-xl border-2 border-[#111111] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111111] px-4 py-2.5 text-white">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-[#FFD700]" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#FFD700]">
              Cabeçalho do Pedido (Linhas 3 a 5 da Planilha)
            </h2>
          </div>
          {templateInfo && (
            <span className="text-[11px] font-semibold text-zinc-300">
              Aba: <strong className="text-white">{templateInfo.sheetName}</strong> • Catálogo:
              Linhas {templateInfo.firstCatalogRow}–{templateInfo.lastCatalogRow}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
          {/* Column A/B Block (Rows 3-5) */}
          <div className="space-y-3">
            <div>
              <label
                htmlFor="order-cliente"
                className="mb-1 block text-xs font-extrabold uppercase text-zinc-700"
              >
                Cliente <span className="font-mono text-[10px] text-zinc-400">(B3)</span>
              </label>
              <input
                id="order-cliente"
                type="text"
                value={header.cliente}
                onChange={(e) => setHeader((prev) => ({ ...prev, cliente: e.target.value }))}
                placeholder="Nome do cliente ou distribuidora"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
            </div>

            <div>
              <label
                htmlFor="order-tipo"
                className="mb-1 block text-xs font-extrabold uppercase text-zinc-700"
              >
                Tipo <span className="font-mono text-[10px] text-zinc-400">(B4)</span>
              </label>
              <input
                id="order-tipo"
                type="text"
                value={header.tipo}
                onChange={(e) => setHeader((prev) => ({ ...prev, tipo: e.target.value }))}
                placeholder="Ex: Base de troca / Reposição"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
            </div>

            <div>
              <label
                htmlFor="order-obs"
                className="mb-1 block text-xs font-extrabold uppercase text-zinc-700"
              >
                OBS. <span className="font-mono text-[10px] text-zinc-400">(B5)</span>
              </label>
              <input
                id="order-obs"
                type="text"
                value={header.obs}
                onChange={(e) => setHeader((prev) => ({ ...prev, obs: e.target.value }))}
                placeholder="Observações do pedido"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
            </div>
          </div>

          {/* Column E/F Block (Rows 3-5) */}
          <div className="space-y-3">
            <div>
              <label
                htmlFor="order-data-inicial"
                className="mb-1 block text-xs font-extrabold uppercase text-zinc-700"
              >
                Data Inicial <span className="font-mono text-[10px] text-zinc-400">(F3)</span>
              </label>
              <input
                id="order-data-inicial"
                type="date"
                value={header.dataInicial}
                onChange={(e) =>
                  setHeader((prev) => ({ ...prev, dataInicial: e.target.value }))
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
            </div>

            <div>
              <label
                htmlFor="order-data-final"
                className="mb-1 block text-xs font-extrabold uppercase text-zinc-700"
              >
                Data Final <span className="font-mono text-[10px] text-zinc-400">(F4)</span>
              </label>
              <input
                id="order-data-final"
                type="date"
                value={header.dataFinal}
                onChange={(e) => setHeader((prev) => ({ ...prev, dataFinal: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
            </div>

            <div>
              <label
                htmlFor="order-comercial"
                className="mb-1 block text-xs font-extrabold uppercase text-zinc-700"
              >
                Comercial <span className="font-mono text-[10px] text-zinc-400">(F5)</span>
              </label>
              <input
                id="order-comercial"
                type="text"
                value={header.comercial}
                onChange={(e) => setHeader((prev) => ({ ...prev, comercial: e.target.value }))}
                placeholder="Responsável comercial"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
            </div>
          </div>

          {/* Column J/K Block (Rows 3-5) */}
          <div className="space-y-3">
            <div>
              <label
                htmlFor="order-hora"
                className="mb-1 block text-xs font-extrabold uppercase text-zinc-700"
              >
                Hora <span className="font-mono text-[10px] text-zinc-400">(K3)</span>
              </label>
              <input
                id="order-hora"
                type="text"
                value={header.hora}
                onChange={(e) => setHeader((prev) => ({ ...prev, hora: e.target.value }))}
                placeholder="Ex: 08:30"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
            </div>

            <div>
              <label
                htmlFor="order-hora-final"
                className="mb-1 block text-xs font-extrabold uppercase text-zinc-700"
              >
                Hora Final{" "}
                <span className="font-mono text-[10px] text-zinc-400">(K4 • opcional)</span>
              </label>
              <input
                id="order-hora-final"
                type="text"
                value={header.horaFinal ?? ""}
                onChange={(e) => setHeader((prev) => ({ ...prev, horaFinal: e.target.value }))}
                placeholder="Ex: 17:00"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
            </div>

            <div>
              <label
                htmlFor="order-expedicao"
                className="mb-1 block text-xs font-extrabold uppercase text-zinc-700"
              >
                Expedição <span className="font-mono text-[10px] text-zinc-400">(K5)</span>
              </label>
              <input
                id="order-expedicao"
                type="text"
                value={header.expedicao}
                onChange={(e) => setHeader((prev) => ({ ...prev, expedicao: e.target.value }))}
                placeholder="Responsável / status expedição"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Filter & Instant Search Controls */}
      <div className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código (ex: VI0487) ou descrição (ex: VOL CHEVROLET AGILE)..."
              className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm text-[#111111] placeholder:text-zinc-400 focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filtrar por montadora"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
            >
              <option value="ALL">Todas as montadoras</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-lg border-2 border-[#111111] bg-[#F8F9FA] p-0.5">
              <button
                type="button"
                onClick={() => setFilterMode("ALL")}
                className={`rounded-md px-3 py-1.5 text-xs font-extrabold transition ${
                  filterMode === "ALL"
                    ? "bg-[#111111] text-[#FFD700]"
                    : "text-[#111111] hover:bg-zinc-200"
                }`}
              >
                Todos os itens ({catalog.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("WITH_QTY")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-extrabold transition ${
                  filterMode === "WITH_QTY"
                    ? "bg-[#111111] text-[#FFD700]"
                    : "text-[#111111] hover:bg-zinc-200"
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                Com quantidade &gt; 0 ({totals.activeLineCount})
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#DC2626] bg-[#FEF2F2] p-4 text-sm font-semibold text-[#991B1B]">
          {error}
        </div>
      )}

      {/* Interactive Catalog Order Table */}
      {loading ? (
        <div className="rounded-xl border border-zinc-300 bg-white p-10 text-center text-sm font-semibold text-zinc-600">
          Carregando os 235 modelos oficiais da planilha...
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border-2 border-[#111111] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-[#F8F9FA] px-4 py-2.5 text-xs font-bold text-zinc-700">
            <span>
              Exibindo <strong className="text-[#111111]">{filteredItems.length}</strong> de{" "}
              <strong className="text-[#111111]">{catalog.length}</strong> modelos oficiais
            </span>
            <span className="text-[11px] font-semibold text-zinc-500">
              Fórmulas automáticas: SUB = PED+RET • PESO = Peso×SUB • TOTAL = REAL×VALOR
            </span>
          </div>

          {filteredItems.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-base font-extrabold text-[#111111]">
                Nenhum volante corresponde aos filtros atuais
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Limpe a busca ou alterne para &ldquo;Todos os itens&rdquo; para preencher
                quantidades.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full border-collapse text-left text-sm">
                <thead className="bg-[#111111] text-xs font-extrabold uppercase tracking-wider text-[#FFD700]">
                  <tr>
                    <th className="px-3 py-3 text-center">Linha</th>
                    <th className="px-3 py-3">Código (A)</th>
                    <th className="px-3 py-3 text-right">Peso Unit. (B)</th>
                    <th className="px-3 py-3">Descrição (C)</th>
                    <th className="px-2 py-3 text-center">PED (E)</th>
                    <th className="px-2 py-3 text-center">RET (F)</th>
                    <th className="px-2 py-3 text-center">SUB (G)</th>
                    <th className="px-2 py-3 text-center">REAL (H)</th>
                    <th className="px-3 py-3 text-right">Peso Total (I)</th>
                    <th className="px-2 py-3 text-center">Valor R$ (J)</th>
                    <th className="px-3 py-3 text-right">Total R$ (K)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {filteredItems.map((item) => {
                    const vals = rowInputs[item.rowNumber] ?? {
                      ped: "",
                      ret: "",
                      real: "",
                      valor: "",
                    };
                    const ped = parsePositiveInput(vals.ped);
                    const ret = parsePositiveInput(vals.ret);
                    const real = parsePositiveInput(vals.real);
                    const valor = parsePositiveInput(vals.valor);
                    const sub = ped + ret;
                    const rowWeightGrams = item.weightGrams * sub;
                    const rowTotal = real * valor;
                    const hasQty = ped > 0 || ret > 0 || real > 0;

                    return (
                      <tr
                        key={item.rowNumber}
                        className={
                          hasQty
                            ? "bg-[#FEFCE8] hover:bg-[#FEF08A]/40"
                            : "odd:bg-white even:bg-[#F8F9FA] hover:bg-[#FFFBEB]"
                        }
                      >
                        <td className="px-3 py-2.5 text-center font-mono text-xs font-bold text-zinc-500">
                          {item.rowNumber}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-block rounded border border-[#111111]/20 bg-[#FFD700]/40 px-1.5 py-0.5 font-mono text-xs font-extrabold text-[#111111]">
                            {item.sku}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-zinc-700">
                          {formatWeight(item.weightGrams)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-[#111111]">{item.description}</div>
                          <span className="text-[11px] font-semibold text-zinc-500">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            aria-label={`PED linha ${item.rowNumber} ${item.sku}`}
                            value={vals.ped}
                            onChange={(e) =>
                              updateRowField(item.rowNumber, "ped", e.target.value)
                            }
                            placeholder="0"
                            className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-center font-mono text-sm font-bold text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            aria-label={`RET linha ${item.rowNumber} ${item.sku}`}
                            value={vals.ret}
                            onChange={(e) =>
                              updateRowField(item.rowNumber, "ret", e.target.value)
                            }
                            placeholder="0"
                            className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-center font-mono text-sm font-semibold text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
                          />
                        </td>
                        <td className="px-2 py-2.5 text-center font-mono text-sm font-extrabold text-[#111111]">
                          {sub > 0 ? formatQuantity(sub) : "—"}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            aria-label={`REAL linha ${item.rowNumber} ${item.sku}`}
                            value={vals.real}
                            onChange={(e) =>
                              updateRowField(item.rowNumber, "real", e.target.value)
                            }
                            placeholder="0"
                            className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-center font-mono text-sm font-semibold text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs font-bold text-zinc-700">
                          {rowWeightGrams > 0 ? formatKgFromGrams(rowWeightGrams) : "—"}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            aria-label={`VALOR linha ${item.rowNumber} ${item.sku}`}
                            value={vals.valor}
                            onChange={(e) =>
                              updateRowField(item.rowNumber, "valor", e.target.value)
                            }
                            placeholder="0,00"
                            className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-right font-mono text-sm font-semibold text-[#111111] focus:border-[#111111] focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm font-extrabold text-[#009C3B]">
                          {rowTotal > 0 ? formatCurrencyBRL(rowTotal) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
