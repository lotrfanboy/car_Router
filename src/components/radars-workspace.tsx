"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  criteriaLocation,
  type Listing,
  type SearchCriteria,
} from "@/lib/discovery";
import { money } from "@/lib/vehicle";
import { listingPath, observedWhen } from "./listing-card";
type RadarMode = "new_listings" | "discount";
type RadarChannel = "in_app" | "email" | "both";
const channelLabels: Record<RadarChannel, string> = {
  in_app: "No aplicativo",
  email: "Por e-mail",
  both: "No aplicativo e por e-mail",
};
const noticeLabels = {
  baseline: "Encontrado na primeira consulta",
  new_listing: "Novo para este Radar",
  price_drop: "Preço caiu",
  discount: "Preço abaixo da média",
};
type Radar = {
  id: string;
  searchId: string;
  name: string;
  minPercent: number;
  intervalHours: 24 | 168;
  enabled: boolean;
  mode: RadarMode;
  channel: RadarChannel;
  runsRemaining: number | null;
  state: "paused" | "pending" | "scheduled" | "running" | "success" | "error";
  missing: string[];
  lastRunAt: string | null;
  nextRunAt: string | null;
  criteria: SearchCriteria;
  notices: {
    id: string;
    kind: keyof typeof noticeLabels;
    status:
      | "recorded"
      | "sending"
      | "sent"
      | "unconfirmed"
      | "email_unavailable"
      | "email_limited";
    matchStatus: "confirmed" | "uncertain";
    listing: Listing | null;
    priceCents: number;
    previousPriceCents: number | null;
    createdAt: string;
    sentAt: string | null;
    channel: RadarChannel;
  }[];
  runs: {
    id: string;
    status: string;
    message: string;
    startedAt: string;
    finishedAt: string | null;
  }[];
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
    [emailReady, setEmailReady] = useState(false),
    [formMode, setFormMode] = useState<RadarMode>("new_listings"),
    [formChannel, setFormChannel] = useState<RadarChannel>("in_app"),
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
    setEmailReady(data.infrastructure.email);
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
      setFormMode("new_listings");
      setFormChannel("in_app");
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
        mode: formMode,
        channel: formChannel,
        runsRemaining:
          String(f.get("runsRemaining")).trim() === ""
            ? null
            : Number(f.get("runsRemaining")),
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
            Acompanhe anúncios encontrados, quedas de preço ou ofertas abaixo da
            média, com os filtros da sua busca.
          </p>
        </div>
        <Link href="/buscar" className="button">
          Buscar carros
        </Link>
      </div>
      {missing.length > 0 && (
        <div className="pending-setup">
          <strong>Monitoramento automático pendente</strong>
          <p>
            Os critérios podem ser salvos. O monitoramento automático depende
            de:
          </p>
          <ul>
            {missing.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {!loading && !emailReady && (
        <p className="pending-setup">
          E-mail não configurado. Você pode receber avisos aqui no aplicativo; o
          canal de e-mail não impede esse monitoramento.
        </p>
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
                O que acompanhar
                <select
                  name="mode"
                  value={formMode}
                  onChange={(event) =>
                    setFormMode(event.target.value as RadarMode)
                  }
                >
                  <option value="new_listings">
                    Novos para o Radar e quedas de preço
                  </option>
                  <option value="discount">Preço abaixo da média</option>
                </select>
              </label>
              {formMode === "discount" ? (
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
              ) : (
                <>
                  <input
                    type="hidden"
                    name="minPercent"
                    value={editing?.minPercent ?? 10}
                  />
                  <p className="muted">
                    A primeira consulta registra o que já foi encontrado. Nas
                    seguintes, o Radar avisa sobre anúncios que ainda não tinha
                    observado e quedas de preço. Isso não confirma quando o
                    anúncio foi publicado.
                  </p>
                </>
              )}
              <label>
                Onde receber
                <select
                  name="channel"
                  value={formChannel}
                  onChange={(event) =>
                    setFormChannel(event.target.value as RadarChannel)
                  }
                >
                  {Object.entries(channelLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {!emailReady && formChannel !== "in_app" && (
                <p className="comparison-pending">
                  {formChannel === "both"
                    ? "Os avisos ficarão no aplicativo. O e-mail aguarda configuração."
                    : "O monitoramento por e-mail aguardará a configuração desse canal. Escolha o aplicativo para receber avisos aqui."}
                </p>
              )}
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
              <label>
                Execuções restantes
                <input
                  name="runsRemaining"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  defaultValue={editing?.runsRemaining ?? ""}
                  placeholder="Sem limite de execuções"
                />
              </label>
              <p className="muted">
                Use 1 para uma única consulta. Ao chegar a zero, o Radar pausa.
                Em branco, continua até você pausar, respeitando os limites de
                créditos das fontes.
              </p>
              <label className="discovery-check">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={editing ? editing.enabled : true}
                />{" "}
                Solicitar monitoramento
              </label>
              <p className="muted">
                O monitoramento depende das fontes e do agendador configurados.
                Cada execução pode consumir créditos das fontes, dentro dos
                mesmos limites da busca manual.
              </p>
              <button disabled={busy} className="button primary">
                {busy ? "Salvando…" : "Salvar Radar"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setEditing(null);
                    setFormMode("new_listings");
                    setFormChannel("in_app");
                  }}
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
                      scheduled: "Agendado; aguardando primeira execução",
                      running: "Execução em andamento",
                      success: "Última execução concluída",
                    }[row.state]
                  }
                </strong>
              </div>
              <p>
                {row.criteria.brand} {row.criteria.model} · Todas as versões ·{" "}
                {row.criteria.yearMin !== null
                  ? `de ${row.criteria.yearMin}`
                  : "sem ano mínimo"}{" "}
                ·{" "}
                {row.criteria.yearMax !== null
                  ? `até ${row.criteria.yearMax}`
                  : "sem ano máximo"}{" "}
                · {criteriaLocation(row.criteria)}
              </p>
              <p>
                {row.mode === "new_listings"
                  ? "Novos para o Radar e quedas de preço"
                  : `A partir de ${row.minPercent}% abaixo da média`}{" "}
                · {row.intervalHours === 24 ? "diário" : "semanal"}
                {" · "}
                {channelLabels[row.channel]}
              </p>
              <p className="muted">
                {row.runsRemaining === null
                  ? "Execuções contínuas até você pausar, dentro dos limites de créditos."
                  : row.runsRemaining === 0
                    ? "Limite de execuções atingido. Edite o limite antes de ativar novamente."
                    : `${row.runsRemaining} execução(ões) restante(s).`}
              </p>
              <p className="muted">
                Última execução:{" "}
                {row.runs[0]
                  ? `${observedWhen(row.runs[0].startedAt)} · ${row.runs[0].status === "running" ? "em andamento" : row.runs[0].status === "ok" ? "concluída" : "falhou"}`
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
                  disabled={busy || (!row.enabled && row.runsRemaining === 0)}
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
                  onClick={() => {
                    setEditing(row);
                    setFormMode(row.mode);
                    setFormChannel(row.channel);
                  }}
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
              {(row.notices ?? []).length > 0 && (
                <section aria-label={`Avisos de ${row.name}`}>
                  <h3>Avisos deste Radar</h3>
                  {row.notices.map((item) => (
                    <article className="pending-setup" key={item.id}>
                      <strong>{noticeLabels[item.kind]}</strong>
                      <p>
                        {item.listing?.title ??
                          "Anúncio registrado no histórico"}
                      </p>
                      <p>
                        {item.previousPriceCents !== null &&
                        item.kind === "price_drop"
                          ? `De ${money(item.previousPriceCents)} para `
                          : ""}
                        {money(item.priceCents)}
                      </p>
                      <p>
                        {!item.listing
                          ? "Registro histórico sem dados suficientes para conferir a correspondência."
                          : item.matchStatus === "confirmed"
                            ? "Correspondência confirmada com os filtros."
                            : "Correspondência incerta. Confira os dados do anúncio; ele não é uma correspondência exata."}
                      </p>
                      {item.kind === "baseline" && (
                        <p>
                          Já estava disponível quando o Radar consultou pela
                          primeira vez. A data de publicação não foi confirmada.
                        </p>
                      )}
                      {item.kind === "new_listing" && (
                        <p>
                          Observado pela primeira vez por este Radar em uma
                          consulta posterior. A publicação pode ser anterior.
                        </p>
                      )}
                      <p className="muted">
                        {observedWhen(item.createdAt)} ·{" "}
                        {item.status === "sent"
                          ? "E-mail aceito pelo provedor"
                          : item.status === "sending"
                            ? "Envio de e-mail sem conclusão registrada"
                            : item.status === "unconfirmed"
                              ? "Envio de e-mail sem confirmação"
                              : item.status === "email_limited"
                                ? "Aviso no aplicativo; limite de 10 e-mails desta execução atingido. Sem reenvio automático."
                                : item.status === "email_unavailable"
                                  ? "Aviso no aplicativo; e-mail não configurado"
                                  : "Aviso registrado no aplicativo"}
                      </p>
                      {item.listing && (
                        <Link
                          href={listingPath(item.listing)}
                          className="text-link"
                        >
                          Ver anúncio observado
                        </Link>
                      )}
                    </article>
                  ))}
                </section>
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
