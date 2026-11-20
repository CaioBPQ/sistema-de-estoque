"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Calendar,
  FileSpreadsheet,
  FileText,
  Lock,
  PackagePlus,
  Search,
  User,
} from "lucide-react";
import { useInventoryUI } from "@/components/AppShell";
import { formatDateTime, formatQuantity } from "@/lib/format";
import type { PurchaseEntryDTO } from "@/types/inventory";

export function EntriesHistoryView() {
  const { activeActor, refreshKey, openEntryModal } = useInventoryUI();
  const isManager = activeActor?.role === "MANAGER";

  const [entries, setEntries] = useState<PurchaseEntryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadEntries = useCallback(async () => {
    if (!isManager) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/entries?limit=100", { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar histórico de entradas.");
      const json = (await res.json()) as { entries: PurchaseEntryDTO[] };
      setEntries(json.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar entradas.");
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries, refreshKey]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => {
      const itemMatch = entry.items.some(
        (i) => i.productName.toLowerCase().includes(q) || i.productSku.toLowerCase().includes(q)
      );
      return (
        itemMatch ||
        entry.supplier.toLowerCase().includes(q) ||
        (entry.referenceCode ?? "").toLowerCase().includes(q) ||
        entry.responsibleName.toLowerCase().includes(q)
      );
    });
  }, [entries, search]);

  if (!isManager) {
    return (
      <div className="rounded-xl border-2 border-[#D97706] bg-[#FEF3C7] p-8 text-center">
        <Lock className="mx-auto h-10 w-10 text-[#111111]" />
        <h2 className="mt-3 text-lg font-extrabold text-[#111111]">
          Área exclusiva do Gestor (Luiz)
        </h2>
        <p className="mt-1 text-sm font-medium text-zinc-800">
          O perfil de Funcionário possui permissão para retiradas e devoluções no catálogo.
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#111111]">
            Entradas & Pedidos de Compra
          </h1>
          <p className="text-sm font-medium text-zinc-600">
            Registre chegadas de volantes manualmente ou importando uma planilha Excel em lote.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openEntryModal()}
            className="inline-flex items-center gap-2 rounded-lg border border-[#111111] bg-[#FFD700] px-4 py-2.5 text-sm font-extrabold text-[#111111] shadow-sm hover:bg-[#F2C900]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Importar Excel no Pedido
          </button>
          <button
            type="button"
            onClick={() => openEntryModal()}
            className="inline-flex items-center gap-2 rounded-lg border border-[#111111] bg-[#009C3B] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-[#008230]"
          >
            <PackagePlus className="h-4 w-4" />
            Registrar Nova Entrada
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrar por fornecedor, NF/pedido, responsável ou volante..."
          className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Carregando histórico de entradas...
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <ArrowDownToLine className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-base font-semibold text-slate-800">
            Nenhuma entrada encontrada
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Clique em &ldquo;Importar Excel no Pedido&rdquo; ou &ldquo;Registrar Nova Entrada&rdquo; para lançar os volantes recebidos.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="overflow-hidden rounded-xl border-2 border-[#111111] bg-white shadow-sm"
            >
              <div className="flex flex-col gap-2 border-b-2 border-[#FFD700] bg-[#111111] px-5 py-3.5 text-white sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-base font-extrabold text-[#FFD700]">{entry.supplier}</span>
                  {entry.referenceCode && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[#FFD700] px-2.5 py-0.5 font-mono text-xs font-extrabold text-[#111111]">
                      <FileText className="h-3 w-3" />
                      {entry.referenceCode}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-200">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-[#FFD700]" />
                    Responsável: <strong className="text-white">{entry.responsibleName}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-[#FFD700]" />
                    {formatDateTime(entry.receivedAt)}
                  </span>
                </div>
              </div>

              {entry.notes && (
                <div className="border-b border-zinc-200 bg-[#F8F9FA] px-5 py-2 text-xs text-zinc-700">
                  <span className="font-bold text-[#111111]">Observação:</span> {entry.notes}
                </div>
              )}

              <div className="divide-y divide-zinc-200">
                {entry.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1 px-5 py-3 odd:bg-white even:bg-[#F8F9FA] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="font-bold text-[#111111]">{item.productName}</span>
                      <span className="ml-2 rounded border border-[#111111]/20 bg-[#FFD700]/40 px-1.5 py-0.5 font-mono text-[11px] font-extrabold text-[#111111]">
                        {item.productSku}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="tabular-nums text-xs font-medium text-zinc-600">
                        Saldo: {formatQuantity(item.previousStock, item.productUnit)} →{" "}
                        {formatQuantity(item.newStock, item.productUnit)}
                      </span>
                      <span className="tabular-nums rounded-lg border border-[#009C3B]/40 bg-[#ECFDF3] px-2.5 py-1 text-xs font-extrabold text-[#006B28]">
                        +{formatQuantity(item.quantity, item.productUnit)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
