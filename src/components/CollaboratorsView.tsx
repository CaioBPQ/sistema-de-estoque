"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Lock, Pencil, Plus, Search, UserCheck, UserX, Users, X } from "lucide-react";
import { useInventoryUI } from "@/components/AppShell";
import { RoleBadge } from "@/components/StatusBadge";
import type { CollaboratorDTO, UserRole } from "@/types/inventory";

export function CollaboratorsView() {
  const { activeActor, refreshKey, triggerRefresh, showToast } = useInventoryUI();
  const isManager = activeActor?.role === "MANAGER";

  const [collaborators, setCollaborators] = useState<CollaboratorDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);

  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [badgeCode, setBadgeCode] = useState("");
  const [role, setRole] = useState<UserRole>("EMPLOYEE");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editBadge, setEditBadge] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("EMPLOYEE");

  const loadCollaborators = useCallback(async () => {
    if (!isManager) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/collaborators?includeInactive=${includeInactive ? "true" : "false"}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Falha ao carregar usuários.");
      const json = (await res.json()) as { collaborators: CollaboratorDTO[] };
      setCollaborators(json.collaborators);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro ao carregar equipe.", "error");
    } finally {
      setLoading(false);
    }
  }, [includeInactive, showToast, isManager]);

  useEffect(() => {
    void loadCollaborators();
  }, [loadCollaborators, refreshKey]);

  if (!isManager) {
    return (
      <div className="rounded-xl border-2 border-[#D97706] bg-[#FEF3C7] p-8 text-center">
        <Lock className="mx-auto h-10 w-10 text-[#111111]" />
        <h2 className="mt-3 text-lg font-extrabold text-[#111111]">
          Gestão de equipe restrita ao Gestor (Luiz)
        </h2>
        <p className="mt-1 text-sm font-medium text-zinc-800">
          Apenas o Dono/Gestor pode cadastrar ou alterar perfis de acesso.
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/collaborators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          department: department.trim() || null,
          badgeCode: badgeCode.trim() || null,
          role,
        }),
      });
      const json = (await res.json()) as { collaborator?: CollaboratorDTO; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao cadastrar usuário.");

      setName("");
      setDepartment("");
      setBadgeCode("");
      setRole("EMPLOYEE");
      showToast(`Usuário ${json.collaborator?.name} cadastrado.`);
      triggerRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro ao cadastrar.", "error");
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (c: CollaboratorDTO) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditDept(c.department ?? "");
    setEditBadge(c.badgeCode ?? "");
    setEditRole(c.role);
  };

  const saveEditing = async (id: string) => {
    try {
      const res = await fetch(`/api/collaborators/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          department: editDept.trim() || null,
          badgeCode: editBadge.trim() || null,
          role: editRole,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao atualizar usuário.");
      setEditingId(null);
      showToast("Dados e permissões atualizados.");
      triggerRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro ao atualizar.", "error");
    }
  };

  const toggleActive = async (c: CollaboratorDTO) => {
    try {
      const res = await fetch(`/api/collaborators/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !c.active }),
      });
      if (!res.ok) throw new Error("Falha ao alterar status.");
      showToast(c.active ? `${c.name} desativado.` : `${c.name} reativado.`);
      triggerRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro ao alterar status.", "error");
    }
  };

  const filtered = collaborators.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.department ?? "").toLowerCase().includes(q) ||
      (c.badgeCode ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Equipe & Perfis de Acesso
        </h1>
        <p className="text-sm text-slate-500">
          Gerencie o perfil de Dono/Gestor (Luiz) e dos Funcionários (Mauro, Jean, Guilherme, Carlinho).
        </p>
      </div>

      {/* Add Form */}
      <form
        onSubmit={handleCreate}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-5"
      >
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome *"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-blue-500"
        >
          <option value="EMPLOYEE">Funcionário</option>
          <option value="MANAGER">Dono / Gestor</option>
        </select>
        <input
          type="text"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          placeholder="Setor / Cargo"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <input
          type="text"
          value={badgeCode}
          onChange={(e) => setBadgeCode(e.target.value)}
          placeholder="Código (opcional)"
          className="rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#111111] bg-[#FFD700] px-4 py-2 text-sm font-extrabold text-[#111111] hover:bg-[#F2C900] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {creating ? "Adicionando..." : "Adicionar"}
        </button>
      </form>

      {/* Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuário por nome, setor ou código..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded border-slate-300 text-blue-600"
          />
          Mostrar inativos
        </label>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Carregando usuários...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-base font-semibold text-slate-800">
            Nenhum usuário encontrado
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-[#111111] bg-white shadow-sm">
          <table className="min-w-[700px] w-full border-collapse text-left text-sm">
            <thead className="bg-[#111111] text-xs font-extrabold uppercase tracking-wider text-[#FFD700]">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Perfil</th>
                <th className="px-4 py-3">Setor / Cargo</th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3 text-right">Movimentações</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((collab) => {
                const isEditing = editingId === collab.id;
                return (
                  <tr key={collab.id} className={!collab.active ? "opacity-60" : ""}>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        collab.name
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as UserRole)}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
                        >
                          <option value="EMPLOYEE">Funcionário</option>
                          <option value="MANAGER">Dono / Gestor</option>
                        </select>
                      ) : (
                        <RoleBadge role={collab.role} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editDept}
                          onChange={(e) => setEditDept(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        collab.department ?? "—"
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editBadge}
                          onChange={(e) => setEditBadge(e.target.value)}
                          className="w-28 rounded-lg border border-slate-300 px-2 py-1 font-mono text-xs uppercase"
                        />
                      ) : (
                        collab.badgeCode ?? "—"
                      )}
                    </td>
                    <td className="tabular-nums px-4 py-3 text-right text-slate-600">
                      {collab.movementCount ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          collab.active
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                            : "bg-slate-100 text-slate-600 ring-1 ring-slate-300"
                        }`}
                      >
                        {collab.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void saveEditing(collab.id)}
                              className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                              aria-label="Salvar"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                              aria-label="Cancelar"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditing(collab)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              aria-label="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleActive(collab)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title={collab.active ? "Desativar" : "Reativar"}
                              aria-label={collab.active ? "Desativar" : "Reativar"}
                            >
                              {collab.active ? (
                                <UserX className="h-4 w-4" />
                              ) : (
                                <UserCheck className="h-4 w-4 text-emerald-600" />
                              )}
                            </button>
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
      )}
    </div>
  );
}
