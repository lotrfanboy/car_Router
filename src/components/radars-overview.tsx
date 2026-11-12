/* Source photos are already remote listings; preserve their original URLs without an image proxy. */
/* eslint-disable @next/next/no-img-element */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bell,
  ChevronRight,
  CarFront,
  ShieldCheck,
  SlidersHorizontal,
  Pause,
  Plus,
  Search,
  X,
} from "lucide-react";
import { criteriaLocation } from "@/lib/discovery";
import {
  radarStateLabels,
  radarYears,
  projectRadarOffers,
  radarSampleSummary,
  type RadarSavedSearch,
  type RadarView,
} from "@/lib/radar-presentation";
import { observedWhen } from "./listing-card";
import styles from "./radar-workspace.module.css";

export function RadarsOverview({
  initialSearchId = "",
  initialOpen = false,
}: {
  initialSearchId?: string;
  initialOpen?: boolean;
}) {
  const [rows, setRows] = useState<RadarView[]>([]);
  const [searches, setSearches] = useState<RadarSavedSearch[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(initialOpen || !!initialSearchId);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<RadarView | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const pending = useRef(false);
  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      fetch("/api/radars", { cache: "no-store" }),
      fetch("/api/searches", { cache: "no-store" }),
    ]);
    if (!r.ok || !s.ok)
      throw Error("Não foi possível carregar seus radares. Tente novamente.");
    const data = await r.json();
    setRows(data.radars);
    setAvailable(
      data.infrastructure.ready && !data.infrastructure.missing.length,
    );
    setSearches((await s.json()).searches);
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  async function mutate(id: string | undefined, body: unknown, method: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/radars${id ? `/${id}` : ""}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Não foi possível salvar o radar.");
      setOpen(false);
      setEditing(null);
      setDeleteId("");
      setMessage(
        method === "DELETE"
          ? "Radar excluído. A busca e os anúncios foram preservados."
          : body && (body as { action?: string }).action === "pause"
            ? "Radar pausado."
            : result.enabled
              ? "Radar salvo. Confira o status de monitoramento abaixo."
              : "Radar salvo e pausado. O monitoramento precisa ser habilitado pela plataforma.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate(
      editing?.id,
      {
        experience: "managed",
        name: form.get("name"),
        searchId: form.get("searchId"),
      },
      editing ? "PUT" : "POST",
    );
  }
  return (
    <div className={`focus-workspace ${styles.workspace}`}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ACOMPANHE O QUE IMPORTA</div>
          <h1>Meus Radares Automotivos</h1>
          <p className="muted">
            Acompanhe os carros que você procura e receba oportunidades por
            e-mail quando o monitoramento estiver ativo.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus size={16} /> Novo radar
        </button>
      </div>
      {!loading && !available && (
        <div className={styles.notice}>
          <Bell size={18} />
          <div>
            <strong>
              Monitoramento automático indisponível neste ambiente
            </strong>
            <p>Seus radares e as ofertas consultadas continuam salvos.</p>
          </div>
          <Link href="/configuracoes#radares">
            Ver situação <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}{" "}
          <button
            className="button small"
            disabled={busy}
            onClick={() =>
              void load()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Tentar novamente
          </button>
        </div>
      )}
      {message && (
        <p className="discovery-notice" role="status">
          {message}
        </p>
      )}
      <div className={styles.overviewTabs} aria-label="Filtrar radares">
        {[
          ["all", "Todos", rows.length],
          [
            "active",
            "Monitorando",
            rows.filter((r) =>
              ["success", "scheduled", "running"].includes(r.state),
            ).length,
          ],
          [
            "paused",
            "Pausados",
            rows.filter((r) => r.state === "paused").length,
          ],
        ].map(([value, label, count]) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(String(value))}
          >
            {label} <span>{count}</span>
          </button>
        ))}
        <span className={styles.fine}>Consultas periódicas · dados salvos</span>
      </div>
      <div className={styles.overviewLayout}>
        <div>
          <div>
            {open && (
              <section className={`panel ${styles.create}`} id="criar-radar">
                <div className={styles.sectionLine}>
                  <h2>{editing ? "Editar radar" : "Criar radar"}</h2>
                  <button
                    className="icon-button"
                    aria-label="Fechar formulário"
                    onClick={() => {
                      setOpen(false);
                      setEditing(null);
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="muted">
                  Reaproveite os critérios de uma busca. A plataforma cuida das
                  verificações e dos avisos.
                </p>
                {searches.length ? (
                  <form
                    onSubmit={submit}
                    className={styles.form}
                    key={editing?.id ?? "new"}
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
                          <option value={s.id} key={s.id}>
                            {s.criteria.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Nome do radar
                      <input
                        name="name"
                        required
                        maxLength={100}
                        defaultValue={editing?.name ?? ""}
                        placeholder="Meu próximo carro"
                      />
                    </label>
                    <div className={styles.formNote}>
                      <Bell size={18} />
                      <p>
                        Novas ofertas confirmadas podem entrar no resumo por
                        e-mail após a primeira verificação. Quedas de preço
                        ficam no histórico do radar.
                      </p>
                    </div>
                    <p className={styles.fine}>
                      As consultas são periódicas. A disponibilidade depende das
                      fontes; a detecção não é instantânea.
                    </p>
                    {!available && (
                      <p className={styles.fine}>
                        Neste ambiente, novos radares serão salvos pausados.
                      </p>
                    )}
                    <button className="button primary" disabled={busy}>
                      {busy
                        ? "Salvando…"
                        : editing
                          ? "Salvar alterações"
                          : "Criar radar"}
                    </button>
                  </form>
                ) : (
                  <div className={styles.empty}>
                    <Search size={24} />
                    <p>
                      {loading
                        ? "Carregando suas buscas…"
                        : "Faça uma busca para definir quais carros acompanhar."}
                    </p>
                    <Link className="button" href="/buscar">
                      Buscar carros
                    </Link>
                  </div>
                )}
              </section>
            )}
            <section aria-label="Seus radares" className={styles.radarList}>
              <div className={styles.sectionLine}>
                <h2>
                  {loading
                    ? "Carregando radares…"
                    : `${rows.length} ${rows.length === 1 ? "radar salvo" : "radares salvos"}`}
                </h2>
                <span className={styles.fine}>
                  {
                    rows.filter((r) =>
                      ["success", "scheduled", "running"].includes(r.state),
                    ).length
                  }{" "}
                  em monitoramento
                </span>
              </div>
              {!loading && !rows.length && (
                <div className={`panel ${styles.empty}`}>
                  <Bell size={30} />
                  <h2>Seu próximo carro começa com uma busca</h2>
                  <p>
                    Crie um radar para reunir as ofertas que combinam com você.
                  </p>
                  <Link href="/buscar" className="button">
                    Buscar carros
                  </Link>
                </div>
              )}
              {rows
                .filter(
                  (row) =>
                    filter === "all" ||
                    (filter === "paused"
                      ? row.state === "paused"
                      : ["success", "scheduled", "running"].includes(
                          row.state,
                        )),
                )
                .map((row) => {
                  const snapshot = projectRadarOffers(
                    row,
                    searches.find((s) => s.id === row.searchId),
                  );
                  const summary = radarSampleSummary(snapshot.offers);
                  const preview = snapshot.offers
                    .filter((o) => o.matchStatus === "confirmed")
                    .slice(0, 3);
                  return (
                    <article
                      className={styles.radarCard}
                      key={row.id}
                      id={`radar-${row.id}`}
                    >
                      <Link
                        className={styles.radarLink}
                        aria-label={`Abrir radar ${row.name}: ${summary.count} ofertas correspondentes`}
                        href={`/radares/${row.id}`}
                        prefetch={false}
                      >
                        <div className={styles.sectionLine}>
                          <span className={styles.state} data-state={row.state}>
                            <span /> {radarStateLabels[row.state]}
                          </span>
                          <ChevronRight size={20} />
                        </div>
                        <h2>{row.name}</h2>
                        <p className={styles.model}>
                          {row.criteria.brand} {row.criteria.model}
                        </p>
                        <div className={styles.chips}>
                          <span>{radarYears(row.criteria)}</span>
                          <span>{criteriaLocation(row.criteria)}</span>
                        </div>
                        <div className={styles.sampleMetrics}>
                          <div>
                            <span>OFERTAS CORRESPONDENTES</span>
                            <strong>
                              {summary.count}{" "}
                              {summary.count === 1 ? "oferta" : "ofertas"}
                            </strong>
                          </div>
                          <div>
                            <span>FAIXA NESTA AMOSTRA</span>
                            <strong>
                              {money(summary.minimum)} —{" "}
                              {money(summary.maximum)}
                            </strong>
                          </div>
                          <div>
                            <span>MÉDIA DA AMOSTRA</span>
                            <strong>{money(summary.mean)}</strong>
                          </div>
                        </div>
                        <p className={styles.previewLabel}>
                          OFERTAS CONSULTADAS ·{" "}
                          {snapshot.sources
                            .map((s) =>
                              s.source === "olx" ? "OLX" : "Webmotors",
                            )
                            .join(" / ")}
                        </p>
                        <div className={styles.miniOffers}>
                          {preview.map(({ listing: l }) => (
                            <div
                              className={styles.miniOffer}
                              key={`${l.source}:${l.externalId}`}
                            >
                              <div className={styles.miniNoPhoto}>
                                <CarFront size={28} />
                                <span>Foto indisponível</span>
                              </div>
                              {l.imageUrl && (
                                <img
                                  src={l.imageUrl}
                                  alt={l.title}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              )}
                              <div>
                                <strong>{money(l.priceCents)}</strong>
                                <span>
                                  {l.city ?? "Cidade não informada"} ·{" "}
                                  {l.mileage !== null
                                    ? `${l.mileage.toLocaleString("pt-BR")} km`
                                    : "Km não informado"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {!summary.count && (
                          <p className={styles.fine}>
                            Ainda sem ofertas confirmadas nesta consulta.
                          </p>
                        )}
                        {summary.review > 0 && (
                          <p className={styles.reviewCount}>
                            {summary.review}{" "}
                            {summary.review === 1
                              ? "correspondência em revisão"
                              : "correspondências em revisão"}{" "}
                            · ver no radar
                          </p>
                        )}
                        {snapshot.sources.some((s) => s.partial) && (
                          <p className={styles.fine}>
                            Amostra parcial das fontes; não representa todo o
                            mercado.
                          </p>
                        )}
                        <div className={styles.cardBottom}>
                          <span className="button small">
                            <ArrowUpRight size={15} /> Abrir radar (
                            {summary.count})
                          </span>
                          <span>
                            Ver critérios e ofertas <ChevronRight size={15} />
                          </span>
                        </div>
                      </Link>
                      <div className={styles.cardFooter}>
                        <small>
                          {row.lastRunAt
                            ? `Última consulta: ${observedWhen(row.lastRunAt)}`
                            : "Ainda sem consulta"}
                        </small>
                        <div>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              void mutate(
                                row.id,
                                { action: row.enabled ? "pause" : "resume" },
                                "PUT",
                              )
                            }
                          >
                            {row.enabled ? (
                              <>
                                <Pause size={13} /> Pausar
                              </>
                            ) : (
                              "Ativar radar"
                            )}
                          </button>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => {
                              setEditing(row);
                              setOpen(true);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            <SlidersHorizontal size={13} /> Editar
                          </button>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => setDeleteId(row.id)}
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                      {deleteId === row.id && (
                        <div className={styles.confirm}>
                          <p>
                            Excluir este radar? A busca e os anúncios serão
                            preservados.
                          </p>
                          <button
                            className="button small"
                            disabled={busy}
                            onClick={() => void mutate(row.id, null, "DELETE")}
                          >
                            Excluir radar
                          </button>{" "}
                          <button
                            className="button small"
                            disabled={busy}
                            onClick={() => setDeleteId("")}
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              {!loading &&
                rows.length > 0 &&
                !rows.some(
                  (r) =>
                    filter === "all" ||
                    (filter === "paused"
                      ? r.state === "paused"
                      : ["success", "scheduled", "running"].includes(r.state)),
                ) && (
                  <div className={styles.empty}>
                    <Pause size={24} />
                    <p>Nenhum radar neste status.</p>
                  </div>
                )}
            </section>
          </div>
        </div>
        <aside className={styles.overviewAside} aria-label="Sobre seus radares">
          <section>
            <h2>
              <ShieldCheck size={21} /> Como o CarRouter monitora suas buscas
            </h2>
            <p>
              Os critérios do radar são comparados com anúncios consultados nas
              fontes selecionadas. A plataforma cuida das verificações
              periódicas.
            </p>
            <div>
              <h3>OPORTUNIDADES COM CONTEXTO</h3>
              <p>
                Ofertas confirmadas ficam separadas das correspondências em
                revisão. Você pode conferir o anúncio original antes de entrar
                em contato.
              </p>
            </div>
            <div>
              <h3>AVISOS POR E-MAIL</h3>
              <p>
                Com o monitoramento habilitado, novas ofertas confirmadas podem
                gerar um resumo. As verificações dependem das fontes; a detecção
                não é instantânea.
              </p>
            </div>
            <Link href="/configuracoes#radares">
              Ver situação do monitoramento <ArrowUpRight size={13} />
            </Link>
          </section>
          <section>
            <h2>
              <Bell size={20} /> Seus radares
            </h2>
            <dl className={styles.overviewTotals}>
              <div>
                <dt>Radares salvos</dt>
                <dd>{rows.length}</dd>
              </div>
              <div>
                <dt>Em monitoramento</dt>
                <dd>
                  {
                    rows.filter((r) =>
                      ["success", "scheduled", "running"].includes(r.state),
                    ).length
                  }
                </dd>
              </div>
              <div>
                <dt>Pausados</dt>
                <dd>{rows.filter((r) => r.state === "paused").length}</dd>
              </div>
            </dl>
            <p>
              Preços e disponibilidade são informados pelos anunciantes. Confira
              as condições na fonte original.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
function money(cents: number | null) {
  return cents === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      }).format(cents / 100);
}
