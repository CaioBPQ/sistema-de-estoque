"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CheckCircle2,
  FileSpreadsheet,
  History,
  Menu,
  Package,
  RotateCcw,
  ShieldCheck,
  User,
  Users,
  X,
} from "lucide-react";
import { AIAssistantWidget } from "@/components/AIAssistantWidget";
import { ProductFormModal } from "@/components/ProductFormModal";
import { QuickEntryModal } from "@/components/QuickEntryModal";
import { QuickReturnModal } from "@/components/QuickReturnModal";
import { QuickWithdrawalModal } from "@/components/QuickWithdrawalModal";
import type { CollaboratorDTO, ProductDTO } from "@/types/inventory";

interface ToastMessage {
  id: number;
  text: string;
  variant: "success" | "error";
}

interface InventoryUIContextValue {
  refreshKey: number;
  triggerRefresh: () => void;
  activeActor: CollaboratorDTO | null;
  collaborators: CollaboratorDTO[];
  switchActor: (actorId: string) => void;
  openWithdrawalModal: (productId?: string | null) => void;
  openReturnModal: (productId?: string | null) => void;
  openEntryModal: (productId?: string | null) => void;
  openProductModal: (product?: ProductDTO | null, categories?: string[]) => void;
  showToast: (text: string, variant?: "success" | "error") => void;
}

const InventoryUIContext = createContext<InventoryUIContextValue | null>(null);

export function useInventoryUI(): InventoryUIContextValue {
  const ctx = useContext(InventoryUIContext);
  if (!ctx) {
    throw new Error("useInventoryUI must be used within AppShell");
  }
  return ctx;
}

const ACTOR_STORAGE_KEY = "stockflow_actor_id";

function writeActorCookie(actorId: string) {
  if (typeof document !== "undefined") {
    document.cookie = `stockflow-actor-id=${encodeURIComponent(actorId)}; path=/; max-age=2592000; SameSite=Lax`;
  }
}

const ALL_NAV_ITEMS = [
  { href: "/", label: "Catálogo de Volantes", icon: Package, managerOnly: false },
  { href: "/entradas", label: "Entradas & Pedidos", icon: ArrowDownToLine, managerOnly: true },
  { href: "/movimentacoes", label: "Relatórios & Auditoria", icon: History, managerOnly: true },
  { href: "/importacao", label: "Importar Excel", icon: FileSpreadsheet, managerOnly: true },
  { href: "/colaboradores", label: "Equipe & Perfis", icon: Users, managerOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [collaborators, setCollaborators] = useState<CollaboratorDTO[]>([]);
  const [activeActor, setActiveActor] = useState<CollaboratorDTO | null>(null);
  const [actorReady, setActorReady] = useState(false);

  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawalProductId, setWithdrawalProductId] = useState<string | null>(null);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnProductId, setReturnProductId] = useState<string | null>(null);

  const [entryOpen, setEntryOpen] = useState(false);
  const [entryProductId, setEntryProductId] = useState<string | null>(null);

  const [productOpen, setProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductDTO | null>(null);
  const [knownCategories, setKnownCategories] = useState<string[]>([]);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (text: string, variant: "success" | "error" = "success") => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, text, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const loadActors = useCallback(async () => {
    try {
      const res = await fetch("/api/collaborators", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { collaborators: CollaboratorDTO[] };
      const list = json.collaborators;
      setCollaborators(list);

      const savedId =
        typeof window !== "undefined" ? localStorage.getItem(ACTOR_STORAGE_KEY) : null;
      const chosen =
        list.find((c) => c.id === savedId) ??
        list.find((c) => c.role === "MANAGER") ??
        list[0] ??
        null;

      if (chosen) {
        setActiveActor(chosen);
        writeActorCookie(chosen.id);
        if (typeof window !== "undefined") {
          localStorage.setItem(ACTOR_STORAGE_KEY, chosen.id);
        }
      }
    } finally {
      setActorReady(true);
    }
  }, []);

  useEffect(() => {
    void loadActors();
  }, [loadActors, refreshKey]);

  const switchActor = useCallback(
    (actorId: string) => {
      const found = collaborators.find((c) => c.id === actorId);
      if (!found) return;
      setActiveActor(found);
      writeActorCookie(found.id);
      if (typeof window !== "undefined") {
        localStorage.setItem(ACTOR_STORAGE_KEY, found.id);
      }
      showToast(
        `Perfil ativo alterado para ${found.name} (${found.role === "MANAGER" ? "Dono / Gestor" : "Funcionário"}).`
      );
      triggerRefresh();
    },
    [collaborators, showToast, triggerRefresh]
  );

  const openWithdrawalModal = useCallback((productId?: string | null) => {
    setWithdrawalProductId(productId ?? null);
    setWithdrawalOpen(true);
  }, []);

  const openReturnModal = useCallback((productId?: string | null) => {
    setReturnProductId(productId ?? null);
    setReturnOpen(true);
  }, []);

  const openEntryModal = useCallback((productId?: string | null) => {
    setEntryProductId(productId ?? null);
    setEntryOpen(true);
  }, []);

  const openProductModal = useCallback(
    (product?: ProductDTO | null, categories: string[] = []) => {
      setEditingProduct(product ?? null);
      setKnownCategories(categories);
      setProductOpen(true);
    },
    []
  );

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleModalSuccess = useCallback(
    (message: string) => {
      showToast(message, "success");
      triggerRefresh();
    },
    [showToast, triggerRefresh]
  );

  const isManager = activeActor?.role === "MANAGER";
  const visibleNavItems = ALL_NAV_ITEMS.filter((item) => !item.managerOnly || isManager);

  return (
    <InventoryUIContext.Provider
      value={{
        refreshKey,
        triggerRefresh,
        activeActor,
        collaborators,
        switchActor,
        openWithdrawalModal,
        openReturnModal,
        openEntryModal,
        openProductModal,
        showToast,
      }}
    >
      <div className="min-h-screen bg-slate-50 pb-24 md:pb-12">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
                aria-label="Menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              <Link href="/" className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <Boxes className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-base font-bold leading-tight text-slate-900">
                    StockFlow
                  </span>
                  <span className="block text-[11px] font-medium text-slate-500">
                    Estoque de Volantes
                  </span>
                </div>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden items-center gap-1 lg:flex">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition xl:px-3 xl:text-sm ${
                      active
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* User Profile Switcher + Quick Actions */}
            <div className="flex items-center gap-2">
              {collaborators.length > 0 && (
                <div
                  className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold ${
                    isManager
                      ? "border-blue-200 bg-blue-50/70 text-blue-900"
                      : "border-slate-200 bg-slate-100 text-slate-800"
                  }`}
                >
                  {isManager ? (
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                  ) : (
                    <User className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                  )}
                  <select
                    aria-label="Usuário ativo"
                    value={activeActor?.id ?? ""}
                    onChange={(e) => switchActor(e.target.value)}
                    className="bg-transparent text-xs font-bold outline-none"
                  >
                    {collaborators.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.role === "MANAGER" ? "Gestor" : "Funcionário"})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="hidden items-center gap-1.5 md:flex">
                {isManager && (
                  <button
                    type="button"
                    onClick={() => openEntryModal()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    Entrada
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openReturnModal()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Devolver
                </button>
                <button
                  type="button"
                  onClick={() => openWithdrawalModal()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700"
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                  Retirar
                </button>
              </div>
            </div>
          </div>

          {/* Tablet nav row when between md and lg */}
          <div className="hidden border-t border-slate-100 px-4 py-1.5 md:flex lg:hidden">
            <nav className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                      active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Mobile Drawer Menu */}
          {mobileMenuOpen && (
            <nav className="border-t border-slate-200 bg-white px-4 py-2 md:hidden">
              <div className="grid grid-cols-1 gap-1">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                        active
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </nav>
          )}
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
          {actorReady ? (
            children
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Carregando perfil de acesso...
            </div>
          )}
        </main>

        {/* Mobile Sticky Action Bar */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-md items-center gap-2">
            {isManager && (
              <button
                type="button"
                onClick={() => openEntryModal()}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 py-2.5 text-xs font-bold text-emerald-800 active:bg-emerald-100"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Entrada
              </button>
            )}
            <button
              type="button"
              onClick={() => openReturnModal()}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-sky-300 bg-sky-50 py-2.5 text-xs font-bold text-sky-800 active:bg-sky-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Devolver
            </button>
            <button
              type="button"
              onClick={() => openWithdrawalModal()}
              className="flex flex-[1.2] items-center justify-center gap-1 rounded-xl bg-orange-600 py-2.5 text-xs font-bold text-white shadow-sm active:bg-orange-700"
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              Retirar
            </button>
          </div>
        </div>

        {/* Global Modals */}
        <QuickWithdrawalModal
          open={withdrawalOpen}
          preselectedProductId={withdrawalProductId}
          onClose={() => setWithdrawalOpen(false)}
          onSuccess={handleModalSuccess}
        />

        <QuickReturnModal
          open={returnOpen}
          activeActor={activeActor}
          preselectedProductId={returnProductId}
          onClose={() => setReturnOpen(false)}
          onSuccess={handleModalSuccess}
        />

        {isManager && (
          <>
            <QuickEntryModal
              open={entryOpen}
              preselectedProductId={entryProductId}
              onClose={() => setEntryOpen(false)}
              onSuccess={handleModalSuccess}
            />

            <ProductFormModal
              open={productOpen}
              product={editingProduct}
              categories={knownCategories}
              onClose={() => setProductOpen(false)}
              onSuccess={handleModalSuccess}
            />

            <AIAssistantWidget />
          </>
        )}

        {/* Toasts */}
        {toasts.length > 0 && (
          <div className="fixed right-4 top-20 z-50 flex w-full max-w-sm flex-col gap-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 ${
                  toast.variant === "error"
                    ? "bg-rose-50 text-rose-900 ring-rose-200"
                    : "bg-slate-900 text-white ring-slate-800"
                }`}
              >
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    toast.variant === "error" ? "text-rose-600" : "text-emerald-400"
                  }`}
                />
                <span className="flex-1">{toast.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </InventoryUIContext.Provider>
  );
}
