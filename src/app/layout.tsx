import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "StockFlow — Controle de Estoque de Volantes",
  description:
    "Sistema web exclusivo para controle de estoque de volantes, entradas, retiradas rápidas com rastreabilidade e importação Excel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
