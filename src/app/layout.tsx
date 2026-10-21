import type { Metadata } from "next";
import { Workspace } from "@/components/workspace";
import "./globals.css";
import "./focus.css";
export const metadata: Metadata = {
  title: "CarRouter — Buscar carros e comparar preços",
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
