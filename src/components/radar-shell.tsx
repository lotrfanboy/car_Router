"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, Radar, X } from "lucide-react";
import { radarBody, radarHeading } from "./radar-fonts";
import styles from "./radar-shell.module.css";

export function RadarShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const links = [
    ["/visao-geral", "Visão geral"],
    ["/buscar", "Buscar carros"],
    ["/radares", "Meus radares"],
    ["/salvos", "Salvos"],
    ["/comparar", "Comparar"],
    ["/veiculos", "Catálogo"],
    ["/configuracoes", "Configurações"],
  ];
  return (
    <div
      className={`${styles.shell} ${radarBody.variable} ${radarHeading.variable}`}
    >
      <header className={styles.header}>
        <Link
          href="/visao-geral"
          className={styles.brand}
          aria-label="CarRouter — Visão geral"
        >
          <Radar size={27} />
          <span>
            CarRouter<span className={styles.brandDot}>.</span>
          </span>
        </Link>
        <button
          ref={trigger}
          className={styles.menu}
          aria-label={open ? "Fechar navegação" : "Abrir navegação"}
          aria-expanded={open}
          aria-controls="radar-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav
          id="radar-navigation"
          aria-label="Navegação principal"
          className={open ? styles.navigationOpen : styles.navigation}
        >
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={
                (href === "/visao-geral" && pathname === "/") ||
                pathname === href ||
                pathname.startsWith(`${href}/`) ||
                (href === "/comparar" && pathname === "/comparar-anuncios")
                  ? "page"
                  : undefined
              }
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="conteudo" tabIndex={-1} className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <Link href="/visao-geral" className={styles.brand}>
          <Radar size={20} />
          <span>CarRouter.</span>
        </Link>
        <span>Preços anunciados. Confira a disponibilidade na fonte.</span>
        <Link href="/configuracoes">Fontes e metodologia</Link>
      </footer>
    </div>
  );
}
