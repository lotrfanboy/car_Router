import type { Metadata } from "next";
import { Workspace } from "@/components/workspace";
import "./globals.css";
export const metadata: Metadata = {
  title: "Radar — Inteligência automotiva",
  description:
    "Radar de veículos com comparáveis, preços observados e referências transparentes. Encontre sua próxima oportunidade com contexto.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <Workspace>{children}</Workspace>
      </body>
    </html>
  );
}
