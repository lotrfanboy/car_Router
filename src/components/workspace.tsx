"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Radar,
  LayoutDashboard,
  CarFront,
  Heart,
  Columns3,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  Search,
  ChartNoAxesCombined,
  Settings2,
  ArrowUpRight,
} from "lucide-react";
import type { Vehicle } from "@/lib/vehicle";

type Store = {
  vehicles: Vehicle[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  selected: string[];
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
  favorite: (v: Vehicle) => Promise<void>;
  notify: (message: string) => void;
};
const Context = createContext<Store | null>(null);
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace ausente");
  return value;
}
export function Workspace({ children }: { children: React.ReactNode }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [globalQuery, setGlobalQuery] = useState("");
  const notify = useCallback((message: string) => setToast(message), []);
  const reload = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/vehicles", { cache: "no-store" });
      if (!response.ok)
        throw new Error("Não foi possível carregar seus anúncios.");
      const rows: Vehicle[] = await response.json();
      setVehicles(rows);
      setSelected((ids) => ids.filter((id) => rows.some((v) => v.id === id)));
    } catch {
      setError("Não foi possível carregar seus anúncios.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // Loading records and restoring a browser preference are external synchronization.
    const initialize = async () => {
      await Promise.resolve();
      try {
        const saved: unknown = JSON.parse(
          sessionStorage.getItem("radar-comparison") || "[]",
        );
        if (Array.isArray(saved)) {
          const ids = saved
            .filter((id): id is string => typeof id === "string")
            .slice(0, 4);
          setSelected(ids);
        }
      } catch {
        /* Storage is optional. */
      }
      await reload();
    };
    void initialize();
  }, [reload]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const persistSelection = (ids: string[]) => {
    setSelected(ids);
    try {
      sessionStorage.setItem("radar-comparison", JSON.stringify(ids));
    } catch {
      /* Storage is optional. */
    }
  };
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const toggleCompare = (id: string) => {
    if (selected.includes(id)) {
      persistSelection(selected.filter((x) => x !== id));
      return;
    }
    if (selected.length >= 4) {
      notify("Você pode comparar até 4 veículos. Remova um da seleção.");
      return;
    }
    persistSelection([...selected, id]);
  };
  const favorite = async (v: Vehicle) => {
    try {
      const response = await fetch("/api/vehicles/" + v.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: !v.favorite }),
      });
      if (!response.ok)
        throw new Error("Não foi possível atualizar o favorito.");
      const row: Vehicle = await response.json();
      setVehicles((list) =>
        list.map((item) => (item.id === row.id ? row : item)),
      );
      notify(
        row.favorite ? "Adicionado aos favoritos." : "Removido dos favoritos.",
      );
    } catch {
      notify("Não foi possível atualizar o favorito. Tente novamente.");
    }
  };
  const nav = [
    { href: "/buscar", label: "Buscar carros", icon: Search },
    { href: "/radares", label: "Meus radares", icon: Radar },
    { href: "/salvos", label: "Salvos", icon: Heart },
  ];
  const secondaryNav = [
    { href: "/veiculos", label: "Catálogo", icon: CarFront },
    { href: "/favoritos", label: "Favoritos do catálogo", icon: Heart },
    { href: "/comparar", label: "Comparador", icon: Columns3 },
    {
      href: "/mercado",
      label: "Análises do catálogo",
      icon: ChartNoAxesCombined,
    },
    {
      href: "/visao-geral",
      label: "Visão geral do catálogo",
      icon: LayoutDashboard,
    },
    { href: "/configuracoes", label: "Configurações", icon: Settings2 },
  ];
  const catalogPage = [
    "/veiculos",
    "/favoritos",
    "/comparar",
    "/mercado",
    "/visao-geral",
  ].some((path) => pathname.startsWith(path));
  return (
    <Context.Provider
      value={{
        vehicles,
        loading,
        error,
        reload,
        selected,
        toggleCompare,
        clearCompare: () => persistSelection([]),
        favorite,
        notify,
      }}
    >
      <div className="app-shell">
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>
        {open && (
          <button
            className="nav-scrim"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
          />
        )}
        <aside className={open ? "sidebar open" : "sidebar"}>
          <Link href="/" className="brand" onClick={() => setOpen(false)}>
            <span className="brand-icon">
              <Radar size={25} />
            </span>
            <span>
              radar<span className="brand-sub">AUTOMOTIVO</span>
            </span>
          </Link>
          <div className="workspace-label">INTELIGÊNCIA AUTOMOTIVA</div>
          <nav aria-label="Navegação principal">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={
                  (href === "/" ? pathname === "/" : pathname.startsWith(href))
                    ? "page"
                    : undefined
                }
                className={
                  (href === "/" ? pathname === "/" : pathname.startsWith(href))
                    ? "nav-link active"
                    : "nav-link"
                }
              >
                <Icon size={18} />
                {label}
                {href === "/favoritos" && (
                  <span className="nav-count">
                    {vehicles.filter((v) => v.favorite).length}
                  </span>
                )}
                {href === "/comparar" && selected.length > 0 && (
                  <span className="nav-count">{selected.length}</span>
                )}
              </Link>
            ))}
            <details className="secondary-nav">
              <summary>Mais ferramentas</summary>
              {secondaryNav.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={
                    pathname.startsWith(href) ? "nav-link active" : "nav-link"
                  }
                >
                  <Icon size={16} />
                  {label}
                </Link>
              ))}
            </details>
          </nav>
          <div className="sidebar-bottom">
            <span className="status-dot" /> Seu espaço pessoal
            <span className="muted">
              Dados persistidos localmente.
              <br />
              Decisões com contexto.
            </span>
            <Link href="/configuracoes" className="sidebar-method">
              Fontes e metodologia <ArrowUpRight size={13} />
            </Link>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="flex items-center gap-3">
              <button
                className="icon-button mobile-menu"
                onClick={() => setOpen(!open)}
                aria-label={open ? "Fechar menu" : "Abrir menu"}
                aria-expanded={open}
              >
                <Menu size={20} />
              </button>
              <span className="breadcrumb">
                Meu espaço <span>/</span>{" "}
                <strong>
                  {[...nav, ...secondaryNav].find((item) =>
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href),
                  )?.label || "Veículo"}
                </strong>
              </span>
            </div>
            <form
              className="global-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                router.push("/veiculos?q=" + encodeURIComponent(globalQuery));
              }}
            >
              <Search size={15} />
              <input
                aria-label="Busca no catálogo salvo"
                placeholder="Pesquisar no catálogo salvo…"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
              />
              <button type="submit" aria-label="Buscar no catálogo salvo">
                <ArrowUpRight size={15} />
              </button>
            </form>
            <Link className="button primary small header-add" href="/buscar">
              <Search size={16} /> Buscar carros
            </Link>
          </header>
          <main id="conteudo" tabIndex={-1}>
            {catalogPage && error ? (
              <div className="error-box" role="alert">
                <AlertCircle />
                {error}
                <button className="button" onClick={() => void reload()}>
                  Tentar novamente
                </button>
              </div>
            ) : catalogPage && loading ? (
              <div
                className="loading-skeleton"
                role="status"
                aria-live="polite"
              >
                <span className="sr-only">Carregando seu radar…</span>
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-hero" />
                <div className="skeleton-grid">
                  <div className="skeleton" />
                  <div className="skeleton" />
                  <div className="skeleton" />
                </div>
              </div>
            ) : (
              children
            )}
          </main>
          <footer className="app-footer">
            <span>RADAR AUTOMOTIVO</span>
            <span>
              Preços anunciados · Referências verificáveis ·{" "}
              <Link href="/configuracoes">Metodologia</Link>
            </span>
          </footer>
        </div>
        {toast && (
          <div className="toast" role="status">
            <CheckCircle2 size={18} />
            {toast}
            <button aria-label="Fechar mensagem" onClick={() => setToast("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {selected.length > 0 &&
          pathname !== "/comparar" &&
          pathname !== "/veiculos/novo" &&
          !pathname.endsWith("/editar") && (
            <div className="compare-bar">
              <Columns3 size={20} />
              <span>
                <strong>{selected.length} de 4</strong> selecionados
              </span>
              <button onClick={() => persistSelection([])}>Limpar</button>
              <Link href="/comparar" className="button primary small">
                Comparar veículos
              </Link>
            </div>
          )}
      </div>
    </Context.Provider>
  );
}
