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
  Users,
  X,
} from "lucide-react";
import { ProductFormModal } from "@/components/ProductFormModal";
import { QuickEntryModal } from "@/components/QuickEntryModal";
import { QuickWithdrawalModal } from "@/components/QuickWithdrawalModal";
import type { ProductDTO } from "@/types/inventory";

interface ToastMessage {
  id: number;
  text: string;
  variant: "success" | "error";
}

interface InventoryUIContextValue {
  refreshKey: number;
  triggerRefresh: () => void;
  openWithdrawalModal: (productId?: string | null) => void;
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

const NAV_ITEMS = [
  { href: "/", label: "Catálogo de Volantes", icon: Package },
  { href: "/entradas", label: "Entradas & Pedidos", icon: ArrowDownToLine },
  { href: "/movimentacoes", label: "Log de Auditoria", icon: History },
  { href: "/importacao", label: "Importar Excel", icon: FileSpreadsheet },
  { href: "/colaboradores", label: "Colaboradores", icon: Users },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawalProductId, setWithdrawalProductId] = useState<string | null>(null);

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

  const openWithdrawalModal = useCallback((productId?: string | null) => {
    setWithdrawalProductId(productId ?? null);
    setWithdrawalOpen(true);
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

  return (
    <InventoryUIContext.Provider
      value={{
        refreshKey,
        triggerRefresh,
        openWithdrawalModal,
        openEntryModal,
        openProductModal,
        showToast,
      }}
    >
      <div className="min-h-screen bg-slate-50 pb-24 md:pb-8">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
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
            <nav className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
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

            {/* Desktop Quick Actions */}
            <div className="hidden items-center gap-2 md:flex">
              <button
                type="button"
                onClick={() => openEntryModal()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
              >
                <ArrowDownToLine className="h-4 w-4" />
                Nova Entrada
              </button>
              <button
                type="button"
                onClick={() => openWithdrawalModal()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700"
              >
                <ArrowUpFromLine className="h-4 w-4" />
                Registrar Retirada
              </button>
            </div>
          </div>

          {/* Mobile Drawer Menu */}
          {mobileMenuOpen && (
            <nav className="border-t border-slate-200 bg-white px-4 py-2 md:hidden">
              <div className="grid grid-cols-1 gap-1">
                {NAV_ITEMS.map((item) => {
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
        <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">{children}</main>

        {/* Mobile Sticky Action Bar (Warehouse Floor Ergonomics) */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-md items-center gap-2.5">
            <button
              type="button"
              onClick={() => openEntryModal()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 py-2.5 text-sm font-bold text-emerald-800 active:bg-emerald-100"
            >
              <ArrowDownToLine className="h-4 w-4" />
              Entrada
            </button>
            <button
              type="button"
              onClick={() => openWithdrawalModal()}
              className="flex flex-[1.3] items-center justify-center gap-1.5 rounded-xl bg-orange-600 py-2.5 text-sm font-bold text-white shadow-sm active:bg-orange-700"
            >
              <ArrowUpFromLine className="h-4 w-4" />
              Retirar Item
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
