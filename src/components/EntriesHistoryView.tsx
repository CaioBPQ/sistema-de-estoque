"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, Calendar, FileText, PackagePlus, Search, User } from "lucide-react";
import { useInventoryUI } from "@/components/AppShell";
import { formatDateTime, formatQuantity } from "@/lib/format";
import type { PurchaseEntryDTO } from "@/types/inventory";

export function EntriesHistoryView() {
  const { refreshKey, openEntryModal } = useInventoryUI();
  const [entries, setEntries] = useState<PurchaseEntryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadEntries = useCallback(async () => {
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
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Entradas & Pedidos de Compra
          </h1>
          <p className="text-sm text-slate-500">
            Histórico completo de mercadorias recebidas, notas fiscais, fornecedores e responsáveis.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openEntryModal()}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
        >
          <PackagePlus className="h-4 w-4" />
          Registrar Nova Entrada
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrar por fornecedor, NF/pedido, responsável ou produto..."
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
            Registre o recebimento de notas fiscais ou pedidos de compra para incrementar o estoque.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-base font-bold text-slate-900">{entry.supplier}</span>
                  {entry.referenceCode && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                      <FileText className="h-3 w-3" />
                      {entry.referenceCode}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    Responsável: <strong className="text-slate-800">{entry.responsibleName}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    {formatDateTime(entry.receivedAt)}
                  </span>
                </div>
              </div>

              {entry.notes && (
                <div className="border-b border-slate-100 px-5 py-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Observação:</span> {entry.notes}
                </div>
              )}

              <div className="divide-y divide-slate-100 px-5">
                {entry.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="font-semibold text-slate-900">{item.productName}</span>
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                        {item.productSku}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="tabular-nums text-xs text-slate-500">
                        Saldo: {formatQuantity(item.previousStock, item.productUnit)} →{" "}
                        {formatQuantity(item.newStock, item.productUnit)}
                      </span>
                      <span className="tabular-nums rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
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
