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
import { Columns3, X, CheckCircle2, AlertCircle } from "lucide-react";
import { RadarShell } from "./radar-shell";
import type { Vehicle } from "@/lib/vehicle";
import {
  readCollectionSelection,
  writeCollectionSelection,
  validSelection,
} from "@/lib/vehicle-collection";

type Store = {
  vehicles: Vehicle[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  selected: string[];
  comparisonKeys: string[];
  toggleSelection: (key: string) => void;
  clearSelection: () => void;
  reconcileListings: (keys: string[]) => void;
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
  const [comparisonKeys, setComparisonKeys] = useState<string[]>([]);
  const selected = comparisonKeys
    .filter((key) => key.startsWith("manual:"))
    .map((key) => key.slice(7));
  const [toast, setToast] = useState("");
  const pathname = usePathname();
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
      setComparisonKeys((keys) => {
        const next = keys.filter(
          (key) =>
            !key.startsWith("manual:") ||
            rows.some((row) => key === `manual:${row.id}`),
        );
        if (next.length !== keys.length) writeCollectionSelection(next);
        return next;
      });
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
      setComparisonKeys(readCollectionSelection());
      await reload();
    };
    void initialize();
  }, [reload]);
  const persistCollection = (keys: string[]) => {
    const next = validSelection(keys);
    setComparisonKeys(next);
    writeCollectionSelection(next);
  };
  const persistSelection = (ids: string[]) =>
    persistCollection([
      ...comparisonKeys.filter((key) => !key.startsWith("manual:")),
      ...ids.map((id) => `manual:${id}`),
    ]);
  const toggleSelection = (key: string) => {
    if (comparisonKeys.includes(key))
      persistCollection(comparisonKeys.filter((item) => item !== key));
    else if (comparisonKeys.length < 4)
      persistCollection([...comparisonKeys, key]);
    else
      notify("Você pode comparar até quatro registros. Remova um da seleção.");
  };
  const toggleCompare = (id: string) => toggleSelection(`manual:${id}`);
  const reconcileListings = useCallback((available: string[]) => {
    const allowed = new Set(available);
    setComparisonKeys((keys) => {
      const next = keys.filter(
        (key) => !key.startsWith("listing:") || allowed.has(key),
      );
      if (next.length !== keys.length) writeCollectionSelection(next);
      return next;
    });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
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
  const catalogPage = [
    "/veiculos",
    "/favoritos",
    "/catalogo/comparar",
    "/mercado",
    "/catalogo/visao-geral",
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));
  return (
    <Context.Provider
      value={{
        vehicles,
        loading,
        error,
        reload,
        selected,
        comparisonKeys,
        toggleSelection,
        clearSelection: () => persistCollection([]),
        reconcileListings,
        toggleCompare,
        clearCompare: () => persistSelection([]),
        favorite,
        notify,
      }}
    >
      <div className="carrouter-app">
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>
        <RadarShell>
          {catalogPage && error ? (
            <div className="error-box" role="alert">
              <AlertCircle />
              {error}
              <button className="button" onClick={() => void reload()}>
                Tentar novamente
              </button>
            </div>
          ) : catalogPage && loading ? (
            <div className="loading-skeleton" role="status" aria-live="polite">
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
        </RadarShell>
        {toast && (
          <div className="toast" role="status">
            <CheckCircle2 size={18} />
            {toast}
            <button aria-label="Fechar mensagem" onClick={() => setToast("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {catalogPage &&
          comparisonKeys.length > 0 &&
          pathname !== "/catalogo/comparar" &&
          pathname !== "/veiculos/novo" &&
          !pathname.endsWith("/editar") && (
            <div className="compare-bar">
              <Columns3 size={20} />
              <span>
                <strong>{comparisonKeys.length} de 4</strong> selecionados
              </span>
              <button onClick={() => persistCollection([])}>
                Limpar seleção
              </button>
              <Link href="/comparar" className="button primary small">
                Comparar veículos
              </Link>
            </div>
          )}
      </div>
    </Context.Provider>
  );
}
