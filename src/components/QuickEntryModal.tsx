"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Search, Trash2, X } from "lucide-react";
import { formatQuantity } from "@/lib/format";
import type { CollaboratorDTO, ProductDTO } from "@/types/inventory";

interface QuickEntryModalProps {
  open: boolean;
  preselectedProductId?: string | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

interface EntryItemDraft {
  productId: string;
  quantity: string;
}

export function QuickEntryModal({
  open,
  preselectedProductId,
  onClose,
  onSuccess,
}: QuickEntryModalProps) {
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorDTO[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [supplier, setSupplier] = useState("Garfer");
  const [referenceCode, setReferenceCode] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [notes, setNotes] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [items, setItems] = useState<EntryItemDraft[]>([{ productId: "", quantity: "1" }]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setSupplier("Garfer");
    setReferenceCode("");
    setNotes("");
    setProductFilter("");

    let cancelled = false;
    setLoadingData(true);

    Promise.all([fetch("/api/products"), fetch("/api/collaborators")])
      .then(async ([prodRes, collabRes]) => {
        if (!prodRes.ok || !collabRes.ok) {
          throw new Error("Falha ao carregar produtos ou colaboradores.");
        }
        const prodJson = (await prodRes.json()) as { products: ProductDTO[] };
        const collabJson = (await collabRes.json()) as { collaborators: CollaboratorDTO[] };
        if (cancelled) return;

        setProducts(prodJson.products);
        setCollaborators(collabJson.collaborators);

        const initialProd = preselectedProductId
          ? prodJson.products.find((p) => p.id === preselectedProductId)
          : prodJson.products[0];

        setItems([{ productId: initialProd?.id ?? "", quantity: "1" }]);
        if (initialProd?.supplier) {
          setSupplier(initialProd.supplier);
        }

        if (collabJson.collaborators.length > 0) {
          setResponsibleId((prev) =>
            collabJson.collaborators.some((c) => c.id === prev)
              ? prev
              : collabJson.collaborators[0].id
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, preselectedProductId]);

  const filteredProducts = useMemo(() => {
    const q = productFilter.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, productFilter]);

  if (!open) return null;

  const addItemRow = () => {
    const usedIds = new Set(items.map((item) => item.productId));
    const nextProd = products.find((p) => !usedIds.has(p.id)) ?? products[0];
    setItems((prev) => [...prev, { productId: nextProd?.id ?? "", quantity: "1" }]);
  };

  const removeItemRow = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateItemRow = (index: number, patch: Partial<EntryItemDraft>) => {
    setItems((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedItems = items.map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity.replace(",", ".")),
    }));

    if (parsedItems.some((item) => !item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      setError("Verifique os produtos e informe quantidades maiores que zero.");
      return;
    }

    const uniqueIds = new Set(parsedItems.map((i) => i.productId));
    if (uniqueIds.size !== parsedItems.length) {
      setError("Produto repetido na mesma entrada. Agrupe a quantidade em uma única linha.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: supplier.trim(),
          referenceCode: referenceCode.trim() || null,
          notes: notes.trim() || null,
          responsibleId,
          items: parsedItems,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao registrar entrada.");
      }

      onSuccess(
        `Entrada registrada com ${parsedItems.length} ${parsedItems.length === 1 ? "item" : "itens"} (${supplier.trim()}).`
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar entrada.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-entry-title"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="quick-entry-title" className="text-lg font-bold text-slate-900">
              Registrar Entrada / Pedido de Compra
            </h2>
            <p className="text-xs text-slate-500">
              Incrementa os saldos automaticamente em transação única e gera histórico do pedido.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Fornecedor *
              </label>
              <input
                type="text"
                required
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Ex: SegurPro Distribuidora"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Nota Fiscal / Pedido
              </label>
              <input
                type="text"
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
                placeholder="Ex: NF-004910 ou PC-2026-102"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Responsável pelo recebimento *
              </label>
              <select
                required
                value={responsibleId}
                onChange={(e) => setResponsibleId(e.target.value)}
                disabled={loadingData}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {collaborators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.department ? ` (${c.department})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Observações
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcional (ex: Reposição mensal)"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* Lista de Itens Recebidos */}
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Volantes Recebidos
              </span>
              <button
                type="button"
                onClick={addItemRow}
                disabled={products.length === 0}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-600 shadow-sm ring-1 ring-slate-200 hover:bg-blue-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar volante
              </button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                placeholder="Filtrar lista de volantes (código, modelo ou montadora)..."
                className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-2">
              {items.map((row, idx) => {
                const prod = products.find((p) => p.id === row.productId);
                const rowOptions =
                  prod && !filteredProducts.some((p) => p.id === prod.id)
                    ? [prod, ...filteredProducts]
                    : filteredProducts;
                const qtyNum = Number(row.quantity.replace(",", "."));
                const projected =
                  prod && Number.isFinite(qtyNum) && qtyNum > 0
                    ? Math.round((prod.currentStock + qtyNum) * 1000) / 1000
                    : null;

                return (
                  <div
                    key={idx}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:flex-row sm:items-center"
                  >
                    <select
                      value={row.productId}
                      onChange={(e) => updateItemRow(idx, { productId: e.target.value })}
                      className="w-full flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                    >
                      {rowOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.sku}] {p.name} (Atual: {formatQuantity(p.currentStock, p.unit)})
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        value={row.quantity}
                        onChange={(e) => updateItemRow(idx, { quantity: e.target.value })}
                        className="tabular-nums w-24 rounded-lg border border-slate-300 px-2.5 py-2 text-right text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                        placeholder="Qtd"
                      />
                      <span className="w-8 text-xs font-semibold text-slate-500">
                        {prod?.unit ?? "un"}
                      </span>
                      {projected !== null && prod && (
                        <span className="tabular-nums hidden text-xs font-medium text-emerald-700 md:inline">
                          → {formatQuantity(projected, prod.unit)}
                        </span>
                      )}
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Remover linha"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || loadingData || products.length === 0 || !responsibleId}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitting ? "Salvando entrada..." : "Confirmar Entrada"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
