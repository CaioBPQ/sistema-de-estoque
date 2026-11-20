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
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  History,
  LayoutGrid,
  Menu,
  Package,
  RotateCcw,
  ShieldCheck,
  User,
  Users,
  X,
} from "lucide-react";
import { AIAssistantWidget } from "@/components/AIAssistantWidget";
import { BrandLogo } from "@/components/BrandLogo";
import { ProductFormModal } from "@/components/ProductFormModal";
import { QuickEntryModal } from "@/components/QuickEntryModal";
import { QuickReturnModal } from "@/components/QuickReturnModal";
import { QuickWithdrawalModal } from "@/components/QuickWithdrawalModal";
import { RoleBadge } from "@/components/StatusBadge";
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
  { href: "/", label: "Catálogo", icon: Package, managerOnly: false },
  { href: "/pedidos", label: "Criar Pedido", icon: ClipboardList, managerOnly: false },
  { href: "/entradas", label: "Entradas & Pedidos", icon: ArrowDownToLine, managerOnly: true },
  { href: "/movimentacoes", label: "Relatórios & Histórico", icon: History, managerOnly: true },
  { href: "/importacao", label: "Importar Excel", icon: FileSpreadsheet, managerOnly: true },
  { href: "/colaboradores", label: "Equipe", icon: Users, managerOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
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
      setProfileModalOpen(false);
      showToast(
        `Acesso ativo: ${found.name} (${found.role === "MANAGER" ? "Dono / Gestor" : "Funcionário"}).`
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
      <div className="min-h-screen bg-[#F8F9FA] pb-24 text-[#111111] md:pb-12">
        {/* Top Brand Header — Two-row zoom-safe layout */}
        <header className="sticky top-0 z-30 border-b-2 border-[#111111] shadow-sm">
          {/* Row 1: Brand + Active Profile + Quick Operational CTAs */}
          <div className="bg-[#FFD700]">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 sm:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="shrink-0 rounded-lg border border-[#111111]/30 bg-white/85 p-2 text-[#111111] hover:bg-white md:hidden"
                  aria-label="Menu"
                >
                  {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>

                <Link href="/" className="min-w-0 shrink-0">
                  <BrandLogo size="sm" showSubtitle darkText />
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {collaborators.length > 0 && (
                  <div className="flex items-center gap-1 rounded-lg border-2 border-[#111111] bg-white px-2 py-1 shadow-sm">
                    {isManager ? (
                      <ShieldCheck className="h-4 w-4 shrink-0 text-[#009C3B]" />
                    ) : (
                      <User className="h-4 w-4 shrink-0 text-[#111111]" />
                    )}
                    <select
                      aria-label="Usuário ativo"
                      value={activeActor?.id ?? ""}
                      onChange={(e) => switchActor(e.target.value)}
                      className="bg-transparent text-xs font-extrabold text-[#111111] outline-none"
                    >
                      {collaborators.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.role === "MANAGER" ? "Gestor" : "Funcionário"})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setProfileModalOpen(true)}
                      className="hidden rounded bg-[#111111] p-1 text-[#FFD700] hover:bg-zinc-800 sm:inline-flex"
                      title="Abrir seletor de acesso rápido"
                      aria-label="Abrir seletor de acesso"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <div className="hidden flex-wrap items-center gap-1.5 md:flex">
                  {isManager && (
                    <button
                      type="button"
                      onClick={() => openEntryModal()}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#111111] bg-[#009C3B] px-3 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#008230]"
                    >
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                      Entrada
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openReturnModal()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#111111] bg-white px-3 py-2 text-xs font-extrabold text-[#111111] shadow-sm transition hover:bg-[#F8F9FA]"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-[#D97706]" />
                    Devolver
                  </button>
                  <button
                    type="button"
                    onClick={() => openWithdrawalModal()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#111111] bg-[#DC2626] px-3.5 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#B91C1C]"
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" />
                    Retirar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Dedicated High-Contrast Navigation Bar (wraps cleanly at any zoom/resolution) */}
          <div className="hidden border-t border-[#111111] bg-[#111111] md:block">
            <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-1.5 px-4 py-2 sm:px-6">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-extrabold transition sm:text-sm ${
                      active
                        ? "bg-[#FFD700] text-[#111111] shadow-sm"
                        : "text-zinc-200 hover:bg-white/10 hover:text-[#FFD700]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Mobile Drawer Menu */}
          {mobileMenuOpen && (
            <nav className="border-t-2 border-[#111111] bg-white px-4 py-2.5 md:hidden">
              <div className="grid grid-cols-1 gap-1">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-bold ${
                        active
                          ? "bg-[#111111] text-[#FFD700]"
                          : "text-[#111111] hover:bg-[#F8F9FA]"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setProfileModalOpen(true);
                  }}
                  className="mt-1 flex items-center gap-2.5 rounded-lg border border-[#111111]/20 bg-[#F8F9FA] px-3 py-2.5 text-sm font-bold text-[#111111]"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Trocar Perfil de Acesso
                </button>
              </div>
            </nav>
          )}
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
          {actorReady ? (
            children
          ) : (
            <div className="rounded-xl border border-zinc-300 bg-white p-10 text-center text-sm font-semibold text-zinc-600">
              Carregando sistema Grupo Volantes Vitória...
            </div>
          )}
        </main>

        {/* Mobile Sticky Action Bar */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-[#FFD700] bg-[#111111] p-3 md:hidden">
          <div className="mx-auto flex max-w-md items-center gap-2">
            {isManager && (
              <button
                type="button"
                onClick={() => openEntryModal()}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#009C3B] py-2.5 text-xs font-extrabold text-white active:bg-[#008230]"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Entrada
              </button>
            )}
            <button
              type="button"
              onClick={() => openReturnModal()}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#FFD700] py-2.5 text-xs font-extrabold text-[#111111] active:bg-[#F2C900]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Devolver
            </button>
            <button
              type="button"
              onClick={() => openWithdrawalModal()}
              className="flex flex-[1.2] items-center justify-center gap-1 rounded-lg bg-[#DC2626] py-2.5 text-xs font-extrabold text-white active:bg-[#B91C1C]"
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              Retirar
            </button>
          </div>
        </div>

        {/* Branded Access / Profile Switcher Modal */}
        {profileModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#111111]/65 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Selecionar perfil de acesso"
          >
            <div className="w-full max-w-md overflow-hidden rounded-xl border-2 border-[#111111] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b-2 border-[#111111] bg-[#FFD700] px-5 py-4">
                <BrandLogo size="md" showSubtitle darkText />
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  className="rounded-lg p-1.5 text-[#111111] hover:bg-[#111111]/10"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-2.5 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Selecione quem está operando o sistema agora
                </p>
                {collaborators.map((c) => {
                  const selected = c.id === activeActor?.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => switchActor(c.id)}
                      className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition ${
                        selected
                          ? "border-[#111111] bg-[#FFFBEB] shadow-sm"
                          : "border-zinc-200 bg-white hover:border-[#111111]/50 hover:bg-[#F8F9FA]"
                      }`}
                    >
                      <div>
                        <div className="text-sm font-extrabold text-[#111111]">{c.name}</div>
                        <div className="text-xs text-zinc-500">
                          {c.role === "MANAGER"
                            ? "Acesso administrativo completo, relatórios e IA"
                            : "Acesso livre para retiradas e devoluções no seu nome"}
                        </div>
                      </div>
                      <RoleBadge role={c.role} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

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
                className={`flex items-start gap-2.5 rounded-xl border-2 px-4 py-3 text-sm font-bold shadow-xl ${
                  toast.variant === "error"
                    ? "border-[#DC2626] bg-[#FEF2F2] text-[#991B1B]"
                    : "border-[#FFD700] bg-[#111111] text-white"
                }`}
              >
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    toast.variant === "error" ? "text-[#DC2626]" : "text-[#FFD700]"
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
