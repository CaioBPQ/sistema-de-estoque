"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Minus, Plus, Search, UserPlus, X } from "lucide-react";
import { formatDateTime, formatQuantity } from "@/lib/format";
import type { CollaboratorDTO, ProductDTO } from "@/types/inventory";

interface QuickWithdrawalModalProps {
  open: boolean;
  preselectedProductId?: string | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const REASON_SUGGESTIONS = [
  "Produção",
  "Manutenção",
  "Uso Interno",
  "Obra / Externo",
];

export function QuickWithdrawalModal({
  open,
  preselectedProductId,
  onClose,
  onSuccess,
}: QuickWithdrawalModalProps) {
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorDTO[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [productSearch, setProductSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState<string>("1");
  const [collaboratorId, setCollaboratorId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showNewCollab, setShowNewCollab] = useState(false);
  const [newCollabName, setNewCollabName] = useState("");
  const [newCollabDept, setNewCollabDept] = useState("");
  const [creatingCollab, setCreatingCollab] = useState(false);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setQuantity("1");
    setReason("");
    setProductSearch("");
    setShowNewCollab(false);
    setNewCollabName("");
    setNewCollabDept("");

    let cancelled = false;
    setLoadingData(true);

    Promise.all([fetch("/api/products"), fetch("/api/collaborators")])
      .then(async ([prodRes, collabRes]) => {
        if (!prodRes.ok || !collabRes.ok) {
          throw new Error("Falha ao carregar catálogo ou colaboradores.");
        }
        const prodJson = (await prodRes.json()) as { products: ProductDTO[] };
        const collabJson = (await collabRes.json()) as { collaborators: CollaboratorDTO[] };
        if (cancelled) return;

        setProducts(prodJson.products);
        setCollaborators(collabJson.collaborators);

        if (preselectedProductId) {
          setProductId(preselectedProductId);
        } else {
          const firstAvailable = prodJson.products.find((p) => p.currentStock > 0);
          setProductId(firstAvailable?.id ?? prodJson.products[0]?.id ?? "");
        }

        if (collabJson.collaborators.length > 0) {
          setCollaboratorId((prev) =>
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
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );

  const numericQty = Number(quantity.replace(",", "."));
  const validQty = Number.isFinite(numericQty) && numericQty > 0;
  const exceedsStock =
    selectedProduct !== null && validQty && numericQty > selectedProduct.currentStock;
  const zeroStock = selectedProduct !== null && selectedProduct.currentStock <= 0;

  if (!open) return null;

  const adjustQuantity = (delta: number) => {
    const base = Number.isFinite(numericQty) ? numericQty : 0;
    const next = Math.max(1, Math.round((base + delta) * 1000) / 1000);
    setQuantity(String(next));
  };

  const handleQuickCreateCollaborator = async () => {
    if (!newCollabName.trim()) {
      setError("Informe o nome do colaborador.");
      return;
    }
    setCreatingCollab(true);
    setError(null);
    try {
      const res = await fetch("/api/collaborators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCollabName.trim(),
          department: newCollabDept.trim() || null,
        }),
      });
      const json = (await res.json()) as { collaborator?: CollaboratorDTO; error?: string };
      if (!res.ok || !json.collaborator) {
        throw new Error(json.error ?? "Não foi possível cadastrar o colaborador.");
      }
      setCollaborators((prev) =>
        [...prev, json.collaborator!].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      );
      setCollaboratorId(json.collaborator.id);
      setShowNewCollab(false);
      setNewCollabName("");
      setNewCollabDept("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar colaborador.");
    } finally {
      setCreatingCollab(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !validQty || exceedsStock || zeroStock) return;
    if (!collaboratorId) {
      setError("Selecione quem está retirando o item.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          quantity: numericQty,
          collaboratorId,
          reason: reason.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Não foi possível registrar a retirada.");
      }
      const collabName =
        collaborators.find((c) => c.id === collaboratorId)?.name ?? "Colaborador";
      onSuccess(
        `Retirada registrada: ${formatQuantity(numericQty, selectedProduct.unit)} de ${selectedProduct.name} por ${collabName}.`
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar retirada.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-withdrawal-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="quick-withdrawal-title" className="text-lg font-bold text-slate-900">
              Registrar Retirada Rápida
            </h2>
            <p className="text-xs text-slate-500">
              Baixa imediata com rastreabilidade de quem retirou e saldo validado.
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

          {/* Produto */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              1. Volante *
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar volante por código (ex: VI0487), modelo ou montadora..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              disabled={loadingData}
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              {filteredProducts.length === 0 && (
                <option value="">Nenhum volante encontrado</option>
              )}
              {filteredProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.sku}] {p.name} — Saldo: {formatQuantity(p.currentStock, p.unit)}
                </option>
              ))}
            </select>

            {selectedProduct && (
              <div
                className={`flex items-center justify-between rounded-xl px-3.5 py-2 text-xs font-medium ${
                  zeroStock
                    ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
                    : selectedProduct.status === "LOW"
                      ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                      : "bg-slate-100 text-slate-700"
                }`}
              >
                <span>Disponível agora no estoque:</span>
                <span className="tabular-nums text-sm font-bold">
                  {formatQuantity(selectedProduct.currentStock, selectedProduct.unit)}
                </span>
              </div>
            )}
          </div>

          {/* Quantidade */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">
              2. Quantidade retirada *
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => adjustQuantity(-1)}
                disabled={zeroStock}
                className="flex h-11 w-12 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                aria-label="Diminuir quantidade"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                step="any"
                min="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className="tabular-nums h-11 w-full rounded-xl border border-slate-300 px-3 text-center text-base font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                type="button"
                onClick={() => adjustQuantity(1)}
                disabled={zeroStock}
                className="flex h-11 w-12 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                aria-label="Aumentar quantidade"
              >
                <Plus className="h-4 w-4" />
              </button>
              {selectedProduct && (
                <span className="min-w-10 text-center text-sm font-semibold text-slate-500">
                  {selectedProduct.unit}
                </span>
              )}
            </div>
            {exceedsStock && selectedProduct && (
              <p className="text-xs font-semibold text-rose-600">
                Quantidade maior que o saldo disponível (
                {formatQuantity(selectedProduct.currentStock, selectedProduct.unit)}).
              </p>
            )}
            {zeroStock && (
              <p className="text-xs font-semibold text-rose-600">
                Este produto está zerado. Registre uma entrada antes de retirar.
              </p>
            )}
          </div>

          {/* Quem pegou */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">
                3. Quem pegou *
              </label>
              <button
                type="button"
                onClick={() => setShowNewCollab((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {showNewCollab ? "Cancelar novo" : "Novo colaborador"}
              </button>
            </div>

            {showNewCollab ? (
              <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/70 p-3">
                <input
                  type="text"
                  value={newCollabName}
                  onChange={(e) => setNewCollabName(e.target.value)}
                  placeholder="Nome completo do colaborador *"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCollabDept}
                    onChange={(e) => setNewCollabDept(e.target.value)}
                    placeholder="Setor (ex: Manutenção)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    disabled={creatingCollab}
                    onClick={handleQuickCreateCollaborator}
                    className="shrink-0 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creatingCollab ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            ) : (
              <select
                value={collaboratorId}
                onChange={(e) => setCollaboratorId(e.target.value)}
                disabled={loadingData}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {collaborators.length === 0 && (
                  <option value="">Cadastre um colaborador acima</option>
                )}
                {collaborators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.department ? ` — ${c.department}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Motivo / Destino */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">
              4. Motivo ou Destino <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Manutenção linha 2, Obra Centro..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {REASON_SUGGESTIONS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setReason(chip)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Data/Hora automática */}
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2 text-xs text-slate-600">
            <Clock className="h-4 w-4 text-slate-400" />
            <span>Data/Hora registrada automaticamente:</span>
            <strong className="text-slate-800">{formatDateTime(new Date())}</strong>
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
              disabled={
                submitting ||
                loadingData ||
                !selectedProduct ||
                !validQty ||
                exceedsStock ||
                zeroStock ||
                !collaboratorId
              }
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitting ? "Registrando..." : "Confirmar Retirada"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
