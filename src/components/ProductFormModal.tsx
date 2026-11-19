"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { formatQuantity } from "@/lib/format";
import type { ProductDTO } from "@/types/inventory";

interface ProductFormModalProps {
  open: boolean;
  product?: ProductDTO | null;
  categories: string[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const DEFAULT_UNITS = ["un", "par", "cx", "pct", "kg"];

const DEFAULT_AUTOMAKERS = [
  "Chevrolet",
  "Citroën",
  "Fiat",
  "Ford",
  "Honda",
  "Hyundai",
  "Iveco",
  "Kia",
  "Mercedes-Benz",
  "Mitsubishi",
  "Nissan",
  "Peugeot",
  "Renault",
  "Toyota",
  "Volkswagen",
];

export function ProductFormModal({
  open,
  product,
  categories,
  onClose,
  onSuccess,
}: ProductFormModalProps) {
  const isEditing = Boolean(product);

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [weightGrams, setWeightGrams] = useState("");
  const [unit, setUnit] = useState("un");
  const [supplier, setSupplier] = useState("Garfer");
  const [minStock, setMinStock] = useState("2");
  const [currentStock, setCurrentStock] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (product) {
      setSku(product.sku);
      setName(product.name);
      setCategory(product.category);
      setWeightGrams(product.weightGrams !== null ? String(product.weightGrams) : "");
      setUnit(product.unit);
      setSupplier(product.supplier ?? "Garfer");
      setMinStock(String(product.minStock));
      setCurrentStock(String(product.currentStock));
    } else {
      setSku("");
      setName("");
      setCategory(categories[0] ?? "Volkswagen");
      setWeightGrams("");
      setUnit("un");
      setSupplier("Garfer");
      setMinStock("2");
      setCurrentStock("0");
    }
  }, [open, product, categories]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const endpoint = isEditing ? `/api/products/${product!.id}` : "/api/products";
      const method = isEditing ? "PATCH" : "POST";

      const trimmedWeight = weightGrams.trim().replace(",", ".");
      const parsedWeight = trimmedWeight.length > 0 ? Number(trimmedWeight) : null;

      const payload: Record<string, unknown> = {
        sku: sku.trim(),
        name: name.trim(),
        category: category.trim(),
        weightGrams: parsedWeight,
        unit: unit.trim() || "un",
        supplier: supplier.trim() || null,
        minStock: Number(minStock.replace(",", ".")),
      };

      if (!isEditing) {
        payload.currentStock = Number(currentStock.replace(",", "."));
      }

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as { product?: ProductDTO; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao salvar volante.");
      }

      onSuccess(
        isEditing
          ? `Volante ${json.product?.name ?? name} atualizado.`
          : `Volante ${json.product?.name ?? name} cadastrado no catálogo.`
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar volante.");
    } finally {
      setSubmitting(false);
    }
  };

  const categorySuggestions = Array.from(new Set([...DEFAULT_AUTOMAKERS, ...categories]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-form-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="product-form-title" className="text-lg font-bold text-slate-900">
            {isEditing ? "Editar Volante" : "Novo Volante no Catálogo"}
          </h2>
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Código / SKU *
              </label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="EX: VI0487"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm uppercase text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Descrição do Volante *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: VOL CHEVROLET AGILE AB"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Montadora *
              </label>
              <input
                type="text"
                required
                list="category-suggestions"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex: Chevrolet, Fiat, Volkswagen"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              <datalist id="category-suggestions">
                {categorySuggestions.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Peso (gramas)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                placeholder="Ex: 1346"
                className="tabular-nums w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Unidade *
              </label>
              <select
                value={DEFAULT_UNITS.includes(unit) ? unit : "__custom__"}
                onChange={(e) => {
                  if (e.target.value !== "__custom__") {
                    setUnit(e.target.value);
                  }
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {DEFAULT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
                {!DEFAULT_UNITS.includes(unit) && <option value="__custom__">{unit}</option>}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Fornecedor Principal
              </label>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Ex: Garfer"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Estoque Mínimo (Alerta) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="tabular-nums w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {isEditing ? (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Saldo Atual (Auditado)
                </label>
                <div className="tabular-nums rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                  {formatQuantity(product!.currentStock, product!.unit)}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Para alterar o saldo, use Entrada ou Retirada.
                </p>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Quantidade Inicial
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={currentStock}
                  onChange={(e) => setCurrentStock(e.target.value)}
                  className="tabular-nums w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            )}
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
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitting ? "Salvando..." : isEditing ? "Salvar Alterações" : "Cadastrar Volante"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
