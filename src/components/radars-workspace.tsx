"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type SearchCriteria } from "@/lib/discovery";
import { observedWhen } from "./listing-card";
type Radar = {
  id: string;
  searchId: string;
  name: string;
  minPercent: number;
  intervalHours: 24 | 168;
  enabled: boolean;
  state: "paused" | "pending" | "error" | "active";
  missing: string[];
  lastRunAt: string | null;
  nextRunAt: string | null;
  criteria: SearchCriteria;
  runs: { id: string; status: string; message: string; startedAt: string }[];
};
export function RadarsWorkspace({
  initialSearchId = "",
}: {
  initialSearchId?: string;
}) {
  const [rows, setRows] = useState<Radar[]>([]),
    [searches, setSearches] = useState<
      { id: string; criteria: SearchCriteria }[]
    >([]),
    [editing, setEditing] = useState<Radar | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [missing, setMissing] = useState<string[]>([]),
    [deleteId, setDeleteId] = useState("");
  const pending = useRef(false);
  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      fetch("/api/radars", { cache: "no-store" }),
      fetch("/api/searches", { cache: "no-store" }),
    ]);
    if (!r.ok || !s.ok)
      throw new Error("Não foi possível carregar os radares.");
    const data = await r.json();
    setRows(data.radars);
    setMissing(data.infrastructure.missing);
    setSearches((await s.json()).searches);
  }, []);
  useEffect(() => {
    Promise.resolve()
      .then(() => load())
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  async function mutate(
    id: string | undefined,
    body: unknown,
    method = "POST",
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/radars${id ? `/${id}` : ""}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setEditing(null);
      setDeleteId("");
      setNotice(
        method === "DELETE"
          ? "Radar excluído. Busca e anúncios preservados."
          : "Radar salvo. Confira o estado do monitoramento abaixo.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    void mutate(
      editing?.id,
      {
        name: f.get("name"),
        searchId: f.get("searchId"),
        minPercent: Number(f.get("minPercent")),
        intervalHours: Number(f.get("intervalHours")),
        enabled: f.get("enabled") === "on",
      },
      editing ? "PUT" : "POST",
    );
  }
  return (
    <div className="focus-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">AS MESMAS BUSCAS, NO SEU TEMPO</div>
          <h1>Meus radares</h1>
          <p className="muted">
            Receba aviso quando um anúncio atingir o percentual abaixo da média
            que você definiu.
          </p>
        </div>
        <Link href="/buscar" className="button">
          Buscar carros
        </Link>
      </div>
      {missing.length > 0 && (
        <div className="pending-setup">
          <strong>Configuração pendente para monitorar e avisar</strong>
          <p>
            Os critérios podem ser salvos. O monitoramento automático depende
            de:
          </p>
          <ul>
            {missing.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p>
            O envio preparado nesta versão é por e-mail. WhatsApp ainda não está
            integrado.
          </p>
        </div>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="discovery-notice">
          {notice}
        </p>
      )}
      <div className="discovery-layout">
        <section className="panel">
          <h2>{editing ? "Editar Radar" : "Criar Radar"}</h2>
          {searches.length ? (
            <form
              key={editing?.id ?? "new"}
              className="discovery-form"
              onSubmit={submit}
            >
              <label>
                Busca
                <select
                  name="searchId"
                  defaultValue={editing?.searchId ?? initialSearchId}
                  required
                >
                  <option value="" disabled>
                    Selecione uma busca
                  </option>
                  {searches.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.criteria.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nome do Radar
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={editing?.name ?? ""}
                  placeholder="Meu próximo carro"
                />
              </label>
              <label>
                Percentual mínimo abaixo da média
                <input
                  name="minPercent"
                  type="number"
                  min="0"
                  max="50"
                  step="0.1"
                  required
                  defaultValue={editing?.minPercent ?? 10}
                />
              </label>
              <label>
                Frequência
                <select
                  name="intervalHours"
                  defaultValue={editing?.intervalHours ?? 24}
                >
                  <option value="24">Uma vez por dia</option>
                  <option value="168">Uma vez por semana</option>
                </select>
              </label>
              <label className="discovery-check">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={editing ? editing.enabled : true}
                />{" "}
                Solicitar monitoramento
              </label>
              <p className="muted">
                Apenas ficará ativo quando fontes, agendador e canal estiverem
                configurados. Consultas respeitam os mesmos limites e créditos
                da busca manual.
              </p>
              <button disabled={busy} className="button primary">
                {busy ? "Salvando…" : "Salvar Radar"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="button"
                  onClick={() => setEditing(null)}
                >
                  Cancelar edição
                </button>
              )}
            </form>
          ) : (
            <p>
              {loading
                ? "Carregando…"
                : "Faça uma busca primeiro para reaproveitar seus critérios aqui."}{" "}
              <Link href="/buscar">Buscar carros</Link>
            </p>
          )}
        </section>
        <section className="discovery-results">
          {!loading && !rows.length && (
            <div className="empty-state">
              <h2>Seu primeiro Radar começa em uma busca</h2>
              <p>
                Use “Criar alerta desta busca” nos resultados ou selecione uma
                busca ao lado.
              </p>
            </div>
          )}
          {rows.map((row) => (
            <article className="panel radar-card" key={row.id}>
              <div className="listing-topline">
                <h2>{row.name}</h2>
                <strong className={`radar-state ${row.state}`}>
                  {
                    {
                      paused: "Pausado",
                      pending: "Configuração pendente",
                      error: "Falha na última execução",
                      active: "Ativo",
                    }[row.state]
                  }
                </strong>
              </div>
              <p>
                {row.criteria.brand} {row.criteria.model} · {row.criteria.city}/
                {row.criteria.state} · a partir de {row.minPercent}% abaixo da
                média · {row.intervalHours === 24 ? "diário" : "semanal"}
              </p>
              <p className="muted">
                Última execução:{" "}
                {row.lastRunAt
                  ? observedWhen(row.lastRunAt)
                  : "ainda não executado"}
                <br />
                Próxima execução:{" "}
                {row.nextRunAt ? observedWhen(row.nextRunAt) : "não agendada"}
              </p>
              {row.state === "pending" && (
                <p className="comparison-pending">{row.missing.join("; ")}</p>
              )}
              <div className="listing-actions">
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      row.id,
                      { ...row, enabled: !row.enabled },
                      "PUT",
                    )
                  }
                >
                  {row.enabled ? "Pausar" : "Ativar"}
                </button>
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => setEditing(row)}
                >
                  Editar
                </button>
                <Link
                  className="button small"
                  href={`/buscar?busca=${row.searchId}`}
                >
                  Abrir busca
                </Link>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setDeleteId(row.id)}
                >
                  Excluir
                </button>
              </div>
              {deleteId === row.id && (
                <div className="pending-setup">
                  <p>
                    Excluir este monitoramento? A busca, anúncios e históricos
                    de preço serão preservados.
                  </p>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => void mutate(row.id, null, "DELETE")}
                  >
                    Confirmar exclusão
                  </button>{" "}
                  <button className="button" onClick={() => setDeleteId("")}>
                    Cancelar
                  </button>
                </div>
              )}
              {row.runs.length > 0 && (
                <details>
                  <summary>Últimas execuções</summary>
                  <ul>
                    {row.runs.map((run) => (
                      <li key={run.id}>
                        {observedWhen(run.startedAt)} ·{" "}
                        {run.status === "running"
                          ? "Execução sem conclusão registrada"
                          : run.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
