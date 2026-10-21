"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookmarkPlus, ArrowUpRight, Trash2, X, Bookmark } from "lucide-react";
import { useWorkspace } from "./workspace";
type Saved = { id: string; name: string; query: string; createdAt: string };
export function SavedCatalogSearches({
  query = "",
  management = false,
}: {
  query?: string;
  management?: boolean;
}) {
  const { notify } = useWorkspace();
  const [rows, setRows] = useState<Saved[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const load = useCallback(async () => {
    await Promise.resolve();
    try {
      const response = await fetch("/api/catalog-searches", {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error("Não foi possível carregar as buscas salvas.");
      setRows(await response.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar buscas.");
    }
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return load();
    });
    const synchronize = (event: Event) => {
      const change = (
        event as CustomEvent<{ created?: Saved; removedId?: string }>
      ).detail;
      if (change.created)
        setRows((previous) => [
          change.created!,
          ...previous.filter((row) => row.id !== change.created!.id),
        ]);
      if (change.removedId)
        setRows((previous) =>
          previous.filter((row) => row.id !== change.removedId),
        );
    };
    window.addEventListener("radar-saved-searches-change", synchronize);
    return () => {
      active = false;
      window.removeEventListener("radar-saved-searches-change", synchronize);
    };
  }, [load]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/catalog-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: new FormData(form).get("name"), query }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível salvar a busca.");
      window.dispatchEvent(
        new CustomEvent("radar-saved-searches-change", {
          detail: { created: data },
        }),
      );
      dialog.current?.close();
      form.reset();
      notify("Busca salva no seu monitoramento.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/catalog-searches/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Não foi possível remover a busca.");
      window.dispatchEvent(
        new CustomEvent("radar-saved-searches-change", {
          detail: { removedId: id },
        }),
      );
      setError("");
      notify("Busca removida.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover.");
    } finally {
      setBusy(false);
    }
  }
  const list = (
    <>
      {rows.length ? (
        rows.map((row) => (
          <div className="saved-query" key={row.id}>
            <Bookmark size={15} />
            <Link href={`/veiculos?${row.query}`}>
              <strong>{row.name}</strong>
              <small>
                {new Date(row.createdAt).toLocaleDateString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}{" "}
                · Aplicar filtros ao radar
              </small>
            </Link>
            <Link
              className="icon-button"
              aria-label={`Abrir busca ${row.name}`}
              href={`/veiculos?${row.query}`}
            >
              <ArrowUpRight size={16} />
            </Link>
            <button
              disabled={busy}
              className="icon-button"
              aria-label={`Remover busca ${row.name}`}
              onClick={() => void remove(row.id)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))
      ) : (
        <p className="panel-copy muted">
          Salve uma combinação de filtros no radar para reencontrá-la aqui.
        </p>
      )}
    </>
  );
  return (
    <div
      className={
        management ? "saved-query-panel panel" : "saved-query-controls"
      }
    >
      {management ? (
        <>
          <div className="section-heading">
            <h2>Buscas salvas</h2>
            <Link href="/veiculos">
              Explorar radar <ArrowUpRight size={15} />
            </Link>
          </div>
          {list}
        </>
      ) : (
        <>
          <button
            className="button small"
            onClick={() => {
              setError("");
              dialog.current?.showModal();
            }}
          >
            <BookmarkPlus size={15} /> Salvar busca
          </button>
          <details className="saved-query-dropdown">
            <summary className="button small">
              Buscas salvas <span className="count">{rows.length}</span>
            </summary>
            <div className="saved-query-popover">{list}</div>
          </details>
        </>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <dialog ref={dialog} className="delete-dialog saved-query-dialog">
        <div className="section-heading">
          <h2>Salvar busca no radar</h2>
          <button
            className="icon-button"
            aria-label="Fechar"
            onClick={() => dialog.current?.close()}
          >
            <X size={16} />
          </button>
        </div>
        <p>
          Os filtros atuais ficarão disponíveis neste computador. Abrir uma
          busca salva não consulta os portais.
        </p>
        <form onSubmit={(e) => void save(e)}>
          <label>
            Nome da busca
            <input
              name="name"
              required
              maxLength={80}
              placeholder="Ex.: SUVs até R$ 120 mil"
              autoComplete="off"
            />
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button"
              onClick={() => dialog.current?.close()}
            >
              Cancelar
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar filtros"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
