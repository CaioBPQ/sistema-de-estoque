"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { useInventoryUI } from "@/components/AppShell";
import { formatQuantity, formatWeight } from "@/lib/format";
import type {
  CollaboratorDTO,
  ImportColumnKey,
  ImportColumnMapping,
  ImportCommitResult,
  ImportConflictStrategy,
  ImportPreviewResponse,
} from "@/types/inventory";

const MAPPING_FIELDS: Array<{ key: ImportColumnKey; label: string; required?: boolean }> = [
  { key: "sku", label: "Código / SKU", required: true },
  { key: "name", label: "Descrição do Volante", required: true },
  { key: "category", label: "Montadora (auto-detectada se vazio)" },
  { key: "weightGrams", label: "Peso (g)" },
  { key: "unit", label: "Unidade de Medida" },
  { key: "supplier", label: "Fornecedor" },
  { key: "minStock", label: "Estoque Mínimo" },
  { key: "currentStock", label: "Saldo Atual" },
];

export function ExcelImportView() {
  const { showToast, triggerRefresh } = useInventoryUI();

  const [collaborators, setCollaborators] = useState<CollaboratorDTO[]>([]);
  const [collaboratorId, setCollaboratorId] = useState("");
  const [strategy, setStrategy] = useState<ImportConflictStrategy>("SKIP");

  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<ImportColumnMapping | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/collaborators")
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as { collaborators: CollaboratorDTO[] };
        setCollaborators(json.collaborators);
      })
      .catch(() => {
        // Optional collaborator selection
      });
  }, []);

  const handleFileUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setCommitResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as ImportPreviewResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Falha ao ler a planilha.");
      }

      setPreview(json);
      setMapping(json.suggestedMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar planilha.");
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleMappingChange = async (key: ImportColumnKey, columnName: string) => {
    if (!preview || !mapping) return;
    const nextMapping: ImportColumnMapping = {
      ...mapping,
      [key]: columnName || null,
    };
    setMapping(nextMapping);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reparse",
          fileName: preview.fileName,
          headers: preview.headers,
          rawRows: preview.rawRows,
          mapping: nextMapping,
        }),
      });
      if (!res.ok) return;
      const updated = (await res.json()) as ImportPreviewResponse;
      setPreview(updated);
    } catch {
      // Keep local mapping
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    const validRows = preview.previewRows
      .filter((r) => r.errors.length === 0)
      .map((r) => ({
        sku: r.sku,
        name: r.name,
        category: r.category,
        weightGrams: r.weightGrams,
        unit: r.unit,
        supplier: r.supplier,
        minStock: r.minStock,
        currentStock: r.currentStock,
      }));

    if (validRows.length === 0) {
      setError("Não há linhas válidas para importar. Verifique o mapeamento das colunas.");
      return;
    }

    setCommitting(true);
    setError(null);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: validRows,
          strategy,
          collaboratorId: collaboratorId || null,
        }),
      });
      const json = (await res.json()) as ImportCommitResult & { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao concluir importação.");
      }

      setCommitResult(json);
      showToast(
        `Importação concluída: ${json.created} criados, ${json.updated} atualizados.`
      );
      triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar produtos.");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Migração e Importação de Planilhas Excel
          </h1>
          <p className="text-sm text-slate-500">
            Suba sua planilha atual em `.xlsx` ou `.csv`, revise os saldos e migre para o banco em segundos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href="/api/import?template=xlsx"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4 text-emerald-600" />
            Modelo Excel (.xlsx)
          </a>
          <a
            href="/api/import?template=csv"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4 text-blue-600" />
            Modelo CSV (.csv)
          </a>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {commitResult && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div className="flex-1">
              <h2 className="text-base font-bold text-emerald-950">
                Importação executada com sucesso!
              </h2>
              <p className="mt-1 text-sm text-emerald-900">
                <strong>{commitResult.created}</strong> produtos criados •{" "}
                <strong>{commitResult.updated}</strong> atualizados •{" "}
                <strong>{commitResult.skipped}</strong> ignorados •{" "}
                <strong>{commitResult.movementsLogged}</strong> movimentações auditadas.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/"
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  Ver Catálogo Atualizado
                </Link>
                <Link
                  href="/movimentacoes"
                  className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                >
                  Conferir Log de Auditoria
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Box */}
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center transition hover:border-blue-400 hover:bg-blue-50/30">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          {uploading ? (
            <FileSpreadsheet className="h-6 w-6 animate-pulse" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
        </div>
        <p className="mt-3 text-base font-bold text-slate-900">
          {uploading
            ? "Lendo planilha..."
            : preview
              ? `Arquivo carregado: ${preview.fileName} (clique para trocar)`
              : "Clique para selecionar sua planilha .xlsx ou .csv"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Suporta planilhas Excel (.xlsx) e CSV separados por ponto e vírgula (;) ou vírgula (,).
        </p>
        <input
          type="file"
          accept=".xlsx,.csv,.txt"
          className="hidden"
          onChange={(e) => void handleFileUpload(e.target.files?.[0])}
        />
      </label>

      {preview && mapping && (
        <>
          {/* Column Mapping & Strategy */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="text-base font-bold text-slate-900">
                1. Mapeamento de Colunas
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Conferimos os nomes automaticamente. Ajuste caso alguma coluna da sua planilha tenha outro título.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {MAPPING_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      {field.label} {field.required && <span className="text-rose-600">*</span>}
                    </label>
                    <select
                      value={mapping[field.key] ?? ""}
                      onChange={(e) => void handleMappingChange(field.key, e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value="">(Não mapeado)</option>
                      {preview.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  2. Regra para SKUs Existentes
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Como tratar produtos cujo SKU já exista no sistema:
                </p>

                <div className="mt-3 space-y-2 text-xs">
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="strategy"
                      checked={strategy === "SKIP"}
                      onChange={() => setStrategy("SKIP")}
                      className="mt-0.5"
                    />
                    <span>
                      <strong className="block text-slate-900">Pular existentes</strong>
                      Importa apenas os volantes novos.
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="strategy"
                      checked={strategy === "UPDATE_METADATA"}
                      onChange={() => setStrategy("UPDATE_METADATA")}
                      className="mt-0.5"
                    />
                    <span>
                      <strong className="block text-slate-900">Atualizar descrição/peso (manter saldo)</strong>
                      Útil para planilhas de pedido sem sobrescrever o estoque real.
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="strategy"
                      checked={strategy === "ADD_STOCK"}
                      onChange={() => setStrategy("ADD_STOCK")}
                      className="mt-0.5"
                    />
                    <span>
                      <strong className="block text-slate-900">Somar ao saldo atual</strong>
                      Adiciona a quantidade da planilha ao saldo existente.
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="strategy"
                      checked={strategy === "REPLACE_STOCK"}
                      onChange={() => setStrategy("REPLACE_STOCK")}
                      className="mt-0.5"
                    />
                    <span>
                      <strong className="block text-slate-900">Substituir saldo</strong>
                      Sobrescreve o saldo com o valor da planilha.
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Responsável pela importação (opcional)
                </label>
                <select
                  value={collaboratorId}
                  onChange={(e) => setCollaboratorId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="">Sistema / Importação</option>
                  {collaborators.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Preview Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                <span className="rounded-lg bg-white px-2.5 py-1 text-slate-700 ring-1 ring-slate-200">
                  Total lido: {preview.rawRowCount}
                </span>
                <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200">
                  Válidas: {preview.validCount} ({preview.newCount} novos /{" "}
                  {preview.existingCount} já no banco)
                </span>
                {preview.errorCount > 0 && (
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-rose-200">
                    Com erro: {preview.errorCount}
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={committing || preview.validCount === 0}
                onClick={() => void handleCommit()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {committing
                  ? "Importando..."
                  : `Importar ${preview.validCount} Produto(s) Válido(s)`}
              </button>
            </div>

            <div className="max-h-96 overflow-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Linha</th>
                    <th className="px-3 py-2.5">Código</th>
                    <th className="px-3 py-2.5">Volante</th>
                    <th className="px-3 py-2.5">Montadora</th>
                    <th className="px-3 py-2.5 text-right">Peso</th>
                    <th className="px-3 py-2.5 text-right">Saldo Planilha</th>
                    <th className="px-3 py-2.5">Status / Validação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.previewRows.slice(0, 150).map((row) => (
                    <tr
                      key={row.rowNumber}
                      className={row.errors.length > 0 ? "bg-rose-50/70" : "hover:bg-slate-50"}
                    >
                      <td className="tabular-nums px-3 py-2 text-slate-500">#{row.rowNumber}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-800">
                        {row.sku || "—"}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {row.name || "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{row.category}</td>
                      <td className="tabular-nums px-3 py-2 text-right text-slate-600">
                        {formatWeight(row.weightGrams)}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right font-bold text-slate-900">
                        {formatQuantity(row.currentStock, row.unit)}
                      </td>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 ? (
                          <span className="font-semibold text-rose-700">
                            {row.errors.join("; ")}
                          </span>
                        ) : row.existsInDb ? (
                          <span className="font-semibold text-amber-700">
                            Já existe (Atual: {formatQuantity(row.existingStock ?? 0, row.unit)})
                          </span>
                        ) : (
                          <span className="font-semibold text-emerald-700">Novo produto</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
