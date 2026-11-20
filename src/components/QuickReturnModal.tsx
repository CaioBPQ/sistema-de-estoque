"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Minus, Plus, RotateCcw, Search, X } from "lucide-react";
import { formatDateTime, formatQuantity } from "@/lib/format";
import type { CollaboratorDTO, ProductCustodyDTO } from "@/types/inventory";

interface QuickReturnModalProps {
  open: boolean;
  activeActor: CollaboratorDTO | null;
  preselectedProductId?: string | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const RETURN_REASONS = [
  "Devolução após uso",
  "Não utilizado",
  "Troca de modelo",
];

export function QuickReturnModal({
  open,
  activeActor,
  preselectedProductId,
  onClose,
  onSuccess,
}: QuickReturnModalProps) {
  const isManager = activeActor?.role === "MANAGER";

  const [collaborators, setCollaborators] = useState<CollaboratorDTO[]>([]);
  const [custodies, setCustodies] = useState<ProductCustodyDTO[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [collaboratorId, setCollaboratorId] = useState("");
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !activeActor) return;
    setError(null);
    setQuantity("1");
    setReason("");
    setSearch("");

    const initialActorId = activeActor.id;
    setCollaboratorId(initialActorId);

    let cancelled = false;
    setLoadingData(true);

    Promise.all([
      fetch("/api/collaborators", { cache: "no-store" }),
      fetch("/api/custodies", { cache: "no-store" }),
    ])
      .then(async ([collabRes, custodyRes]) => {
        if (!collabRes.ok || !custodyRes.ok) {
          throw new Error("Falha ao carregar volantes em uso.");
        }
        const collabJson = (await collabRes.json()) as { collaborators: CollaboratorDTO[] };
        const custodyJson = (await custodyRes.json()) as { custodies: ProductCustodyDTO[] };
        if (cancelled) return;

        setCollaborators(collabJson.collaborators);
        setCustodies(custodyJson.custodies);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar devoluções.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeActor]);

  const effectiveCollabId = isManager ? collaboratorId || activeActor?.id || "" : activeActor?.id || "";

  const actorCustodies = useMemo(() => {
    return custodies.filter((c) => c.collaboratorId === effectiveCollabId);
  }, [custodies, effectiveCollabId]);

  const filteredCustodies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return actorCustodies;
    return actorCustodies.filter(
      (c) =>
        c.productName.toLowerCase().includes(q) ||
        c.productSku.toLowerCase().includes(q) ||
        c.productCategory.toLowerCase().includes(q)
    );
  }, [actorCustodies, search]);

  useEffect(() => {
    if (!open) return;
    if (preselectedProductId && actorCustodies.some((c) => c.productId === preselectedProductId)) {
      setProductId(preselectedProductId);
    } else if (actorCustodies.length > 0 && !actorCustodies.some((c) => c.productId === productId)) {
      setProductId(actorCustodies[0].productId);
    } else if (actorCustodies.length === 0) {
      setProductId("");
    }
  }, [open, preselectedProductId, actorCustodies, productId]);

  const selectedCustody = useMemo(
    () => actorCustodies.find((c) => c.productId === productId) ?? null,
    [actorCustodies, productId]
  );

  if (!open) return null;

  const numericQty = Number(quantity.replace(",", "."));
  const validQty = Number.isFinite(numericQty) && numericQty > 0;
  const exceedsHeld =
    selectedCustody !== null && validQty && numericQty > selectedCustody.quantity;

  const adjustQty = (delta: number) => {
    const base = Number.isFinite(numericQty) ? numericQty : 0;
    const maxHeld = selectedCustody?.quantity ?? 1;
    const next = Math.min(maxHeld, Math.max(1, Math.round((base + delta) * 1000) / 1000));
    setQuantity(String(next));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustody || !validQty || exceedsHeld || !effectiveCollabId) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedCustody.productId,
          quantity: numericQty,
          collaboratorId: effectiveCollabId,
          reason: reason.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao registrar devolução.");
      }

      onSuccess(
        `Devolução registrada: ${formatQuantity(numericQty, selectedCustody.productUnit)} de ${selectedCustody.productName} por ${selectedCustody.collaboratorName}.`
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar devolução.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-return-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="quick-return-title" className="text-lg font-bold text-slate-900">
              Registrar Devolução ao Estoque
            </h2>
            <p className="text-xs text-slate-500">
              Retorna volantes em uso de volta ao saldo livre do estoque.
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

          {/* Quem está devolvendo */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">
              1. Quem está devolvendo *
            </label>
            {isManager ? (
              <select
                value={effectiveCollabId}
                onChange={(e) => setCollaboratorId(e.target.value)}
                disabled={loadingData}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500"
              >
                {collaborators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.role === "MANAGER" ? "Gestor" : "Funcionário"})
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm font-semibold text-sky-900">
                {activeActor?.name} — vínculo automático (Funcionário)
              </div>
            )}
          </div>

          {/* Volante em uso */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              2. Volante em uso *
            </label>
            {actorCustodies.length > 5 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar volantes em posse..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>
            )}

            {actorCustodies.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-xs text-slate-600">
                Nenhum volante registrado em uso para este usuário no momento.
              </div>
            ) : (
              <>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  disabled={loadingData}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-500"
                >
                  {filteredCustodies.map((c) => (
                    <option key={c.id} value={c.productId}>
                      [{c.productSku}] {c.productName} — Em posse:{" "}
                      {formatQuantity(c.quantity, c.productUnit)}
                    </option>
                  ))}
                </select>

                {selectedCustody && (
                  <div className="flex items-center justify-between rounded-xl bg-sky-50 px-3.5 py-2 text-xs font-medium text-sky-900 ring-1 ring-sky-200">
                    <span>Quantidade em posse para devolver:</span>
                    <span className="tabular-nums text-sm font-bold">
                      {formatQuantity(selectedCustody.quantity, selectedCustody.productUnit)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Quantidade */}
          {selectedCustody && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">
                  3. Quantidade devolvida *
                </label>
                <button
                  type="button"
                  onClick={() => setQuantity(String(selectedCustody.quantity))}
                  className="text-xs font-semibold text-sky-700 hover:text-sky-800"
                >
                  Devolver tudo ({selectedCustody.quantity})
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustQty(-1)}
                  className="flex h-11 w-12 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  max={selectedCustody.quantity}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  className="tabular-nums h-11 w-full rounded-xl border border-slate-300 px-3 text-center text-base font-bold text-slate-900 outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => adjustQty(1)}
                  className="flex h-11 w-12 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {exceedsHeld && (
                <p className="text-xs font-semibold text-rose-600">
                  Quantidade maior que o total em posse (
                  {formatQuantity(selectedCustody.quantity, selectedCustody.productUnit)}).
                </p>
              )}
            </div>
          )}

          {/* Motivo */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">
              4. Observação <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Devolvido após teste / não utilizado"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {RETURN_REASONS.map((chip) => (
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
                !selectedCustody ||
                !validQty ||
                exceedsHeld
              }
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              {submitting ? "Registrando..." : "Confirmar Devolução"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
