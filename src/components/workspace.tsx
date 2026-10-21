"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Radar,
  LayoutDashboard,
  CarFront,
  Heart,
  Columns3,
  Plus,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
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
  const notify = useCallback((message: string) => setToast(message), []);
  const reload = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/vehicles", { cache: "no-store" });
      if (!response.ok)
        throw new Error("Não foi possível carregar seus anúncios.");
      const rows: Vehicle[] = await response.json();
      setVehicles(rows);
      setSelected((ids) => ids.filter((id) => rows.some((v) => v.id === id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
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
            .slice(0, 3);
          setSelected(ids);
        }
      } catch {
        /* Storage is optional. */
      }
      await reload();
    };
    void initialize();
  }, [reload]);
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
    if (selected.length >= 3) {
      notify("Você pode comparar até 3 veículos. Remova um da seleção.");
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
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha ao salvar.");
    }
  };
  const nav = [
    { href: "/", label: "Visão geral", icon: LayoutDashboard },
    { href: "/veiculos", label: "Catálogo", icon: CarFront },
    { href: "/favoritos", label: "Favoritos", icon: Heart },
    { href: "/comparar", label: "Comparador", icon: Columns3 },
  ];
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
          <div className="workspace-label">ESPAÇO DE TRABALHO</div>
          <nav>
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
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
          </nav>
          <div className="sidebar-bottom">
            <span className="status-dot" /> Ambiente local
            <span className="muted">Seus anúncios, no seu computador.</span>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="flex items-center gap-3">
              <button
                className="icon-button mobile-menu"
                onClick={() => setOpen(!open)}
                aria-label="Abrir menu"
              >
                <Menu size={20} />
              </button>
              <span className="breadcrumb">
                Meu espaço <span>/</span>{" "}
                <strong>
                  {pathname === "/"
                    ? "Visão geral"
                    : pathname === "/comparar"
                      ? "Comparador"
                      : pathname === "/favoritos"
                        ? "Favoritos"
                        : "Veículos"}
                </strong>
              </span>
            </div>
            <Link className="button primary small" href="/veiculos/novo">
              <Plus size={16} /> Novo anúncio
            </Link>
          </header>
          <main>
            {error ? (
              <div className="error-box" role="alert">
                <AlertCircle />
                {error}
                <button className="button" onClick={() => void reload()}>
                  Tentar novamente
                </button>
              </div>
            ) : loading ? (
              <div className="loading" role="status">
                <span className="spinner" />
                Carregando seu radar…
              </div>
            ) : (
              children
            )}
          </main>
          <footer className="app-footer">
            <span>RADAR AUTOMOTIVO</span>
            <span>Organize. Compare. Decida.</span>
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
                <strong>{selected.length} de 3</strong> selecionados
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
