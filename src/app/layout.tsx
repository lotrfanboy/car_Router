import type { Metadata } from "next";
import { Workspace } from "@/components/workspace";
import "./globals.css";
export const metadata: Metadata = {
  title: "Radar Automotivo",
  description: "Seu espaço para organizar e comparar anúncios de veículos.",
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
