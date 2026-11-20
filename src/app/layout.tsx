import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Grupo Volantes Vitória — Controle de Estoque",
  description:
    "Sistema web de controle de estoque do Grupo Volantes Vitória: catálogo por montadora, entradas, retiradas, devoluções e assistente IA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#F8F9FA] font-sans text-[#111111] antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
