"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ExternalLink, RefreshCw, BookmarkPlus } from "lucide-react";
import {
  searchSchema,
  sourceNames,
  type SearchCriteria,
  type SearchResult,
  type Source,
  type Listing,
} from "@/lib/discovery";
import { money, number, states } from "@/lib/vehicle";
type Run = SearchResult & {
  id: string;
  createdAt: string;
  interrupted?: boolean;
};
type Saved = { id: string; criteria: SearchCriteria; latest: Run | null };
type Integration = {
  source: Source;
  configured: boolean;
  cost: number;
  reservedToday: number;
  dailyLimit: number;
  lastAttemptAt: string | null;
  lastAttemptStatus: "ok" | "error" | "unconfigured" | null;
  lastSuccessfulAt: string | null;
};
const when = (date: string) => new Date(date).toLocaleString("pt-BR");

function PriceHistory({ listing }: { listing: Listing }) {
  const [rows, setRows] = useState<
    { id: number; observedAt: string; priceCents: number }[] | null
  >(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    if (rows) {
      setRows(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/discoveries/${listing.source}/${encodeURIComponent(listing.externalId)}/prices`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error();
      setRows(await response.json());
    } catch {
      setError("Não foi possível abrir o histórico.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="discovery-history">
      <button
        className="text-button"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy ? "Carregando…" : rows ? "Fechar histórico" : "Preços observados"}
      </button>
      {error && <p role="alert">{error}</p>}
      {rows && (
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              {when(r.observedAt)} · <strong>{money(r.priceCents)}</strong>
            </li>
          ))}
          {rows.length === 1 && (
            <li>Primeira observação; ainda não há mudança para comparar.</li>
          )}
        </ul>
      )}
    </div>
  );
}
export function SearchWorkspace() {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [failedAttemptAt, setFailedAttemptAt] = useState<string | null>(null);
  const [showNear, setShowNear] = useState(false);
  async function refresh() {
    const response = await fetch("/api/searches", { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar as buscas.");
    const data = await response.json();
    setSaved(data.searches);
    setIntegrations(data.integrations);
    setSelected((id) =>
      data.searches.some((s: Saved) => s.id === id)
        ? id
        : (data.searches[0]?.id ?? ""),
    );
  }
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await refresh();
      } catch {
        if (!cancelled)
          setError("Não foi possível carregar as buscas. Recarregue a página.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);
  const active = saved.find((s) => s.id === selected);
  const run = active?.latest;
  const listings = run?.sources.flatMap((s) => s.listings) ?? [];
  const eligible = listings.filter((r) => !r.reasons.length);
  const configuredSources = new Set(
    integrations.filter((item) => item.configured).map((item) => item.source),
  );
  const activeHasUsableSource = Boolean(
    active?.criteria.sources.some((source) => configuredSources.has(source)),
  );
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const nullable = (key: string) =>
      form.get(key) === "" ? null : Number(form.get(key));
    const parsed = searchSchema.safeParse({
      name: form.get("name"),
      brand: form.get("brand"),
      model: form.get("model"),
      city: form.get("city"),
      state: form.get("state"),
      yearMin: nullable("yearMin"),
      yearMax: nullable("yearMax"),
      priceMax: nullable("priceMax"),
      mileageMax: nullable("mileageMax"),
      privateOnly: form.get("privateOnly") === "on",
      olxUrl: "",
      sources: form.getAll("sources"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await refresh();
      setSelected(result.id);
      setNotice(
        "Busca salva. A consulta só começa ao clicar em Consultar agora.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function execute() {
    if (!active || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setFailedAttemptAt(null);
    try {
      const response = await fetch(`/api/searches/${active.id}/run`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const completed = result as Run;
      await refresh();
      setShowNear(false);
      const succeeded = completed.sources.filter(
        (source) => source.status === "ok",
      );
      setNotice(
        succeeded.length === completed.sources.length
          ? succeeded.some((source) => source.partial)
            ? "Consulta concluída com cobertura parcial. Confira os limites de cada fonte."
            : "Consulta concluída com todas as fontes selecionadas."
          : succeeded.length
            ? "Resultado parcial: ao menos uma fonte respondeu e outra não concluiu."
            : "A tentativa terminou sem uma consulta válida. Confira o estado das fontes.",
      );
    } catch (e) {
      setFailedAttemptAt(new Date().toISOString());
      setError(e instanceof Error ? e.message : "Falha ao consultar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SEU RADAR DE OPORTUNIDADES</div>
          <h1>Buscar nos portais</h1>
          <p className="muted">
            Salve seus critérios, consulte anúncios reais e acompanhe os preços.
          </p>
        </div>
      </div>
      <div className="discovery-status-grid">
        {integrations.map((i) => (
          <section className="panel" key={i.source}>
            <h2>{sourceNames[i.source]}</h2>
            <p className={i.lastSuccessfulAt ? "discovery-info" : "muted"}>
              {!i.configured
                ? "Configuração necessária"
                : i.lastSuccessfulAt
                  ? `Verificada em consulta em ${when(i.lastSuccessfulAt)}`
                  : "Configurada · conexão ainda não verificada"}
            </p>
            <p className="muted">
              Até {i.cost} crédito(s) por consulta · controle local:{" "}
              {i.reservedToday}/{i.dailyLimit} hoje
            </p>
            {i.lastAttemptAt && i.lastAttemptStatus !== "ok" && (
              <p className="discovery-warning">
                Última tentativa em {when(i.lastAttemptAt)} não foi concluída.
              </p>
            )}
          </section>
        ))}
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p className="discovery-notice" role="status">
          {notice}
        </p>
      )}
      <div className="discovery-layout">
        <section className="panel">
          <h2>
            <BookmarkPlus size={18} /> Nova busca
          </h2>
          <p className="muted discovery-help">
            Salvar não consome créditos. Não há consulta automática.
          </p>
          <form onSubmit={save} className="discovery-form">
            <label>
              Nome da busca
              <input
                name="name"
                required
                maxLength={100}
                placeholder="Meu próximo Corolla"
              />
            </label>
            <div className="form-grid two">
              <label>
                Marca
                <input
                  name="brand"
                  required
                  maxLength={80}
                  placeholder="Toyota"
                />
              </label>
              <label>
                Modelo
                <input
                  name="model"
                  required
                  maxLength={100}
                  placeholder="Corolla"
                />
              </label>
            </div>
            <div className="form-grid two">
              <label>
                Cidade
                <input
                  name="city"
                  required
                  maxLength={120}
                  placeholder="Curitiba"
                />
              </label>
              <label>
                UF
                <select name="state" defaultValue="PR">
                  {states.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid two">
              <label>
                Ano-modelo mínimo
                <input name="yearMin" type="number" min="1900" max="2100" />
              </label>
              <label>
                Ano-modelo máximo
                <input name="yearMax" type="number" min="1900" max="2100" />
              </label>
            </div>
            <div className="form-grid two">
              <label>
                Preço máximo (R$)
                <input name="priceMax" type="number" min="1" max="10000000" />
              </label>
              <label>
                Quilometragem máxima
                <input name="mileageMax" type="number" min="0" max="10000000" />
              </label>
            </div>
            <label className="discovery-check">
              <input type="checkbox" name="privateOnly" /> Somente particulares
              confirmados
            </label>
            <fieldset>
              <legend>Fontes</legend>
              <label className="discovery-check">
                <input
                  type="checkbox"
                  name="sources"
                  value="olx"
                  defaultChecked
                />{" "}
                OLX
              </label>
              <label className="discovery-check">
                <input
                  type="checkbox"
                  name="sources"
                  value="webmotors"
                  defaultChecked
                />{" "}
                Webmotors
              </label>
            </fieldset>
            <p className="muted discovery-help">
              A busca na OLX é montada automaticamente com o carro e a cidade
              informados. Uma cidade nova pode consumir 1 crédito Reef adicional
              para localizar a região; depois essa informação é reaproveitada.
            </p>
            <button disabled={busy} className="button primary" type="submit">
              <BookmarkPlus size={17} /> Salvar busca
            </button>
          </form>
        </section>
        <section className="discovery-results">
          <div className="panel">
            <label>
              Buscas salvas
              <select
                disabled={busy || !saved.length}
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setShowNear(false);
                  setNotice("");
                  setFailedAttemptAt(null);
                }}
              >
                {!saved.length && <option value="">Nenhuma busca salva</option>}
                {saved.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.criteria.name} · {s.criteria.brand} {s.criteria.model} ·{" "}
                    {s.criteria.city}/{s.criteria.state}
                  </option>
                ))}
              </select>
            </label>
            {active && (
              <>
                <p className="discovery-help">
                  {active.criteria.brand} {active.criteria.model} ·{" "}
                  {active.criteria.city}/{active.criteria.state} ·{" "}
                  {active.criteria.sources
                    .map((s) => sourceNames[s])
                    .join(" + ")}
                </p>
                <button
                  className="button primary"
                  disabled={busy || !activeHasUsableSource}
                  onClick={() => void execute()}
                >
                  {busy ? (
                    <RefreshCw size={17} className="spin" />
                  ) : (
                    <Search size={17} />
                  )}
                  {busy ? "Consultando…" : "Consultar agora"}
                </button>
                {!activeHasUsableSource && (
                  <div className="discovery-blocked" role="status">
                    <strong>Nenhuma fonte utilizável nesta busca.</strong>
                    <span>
                      Configure ao menos uma integração selecionada antes de
                      consultar. Salvar os critérios continua disponível e não
                      consome créditos.
                    </span>
                    <Link className="button" href="/configuracoes">
                      Abrir configurações
                    </Link>
                  </div>
                )}
                <p className="discovery-help muted">
                  Ano-modelo: {active.criteria.yearMin ?? "sem mínimo"} a{" "}
                  {active.criteria.yearMax ?? "sem máximo"} · Preço:{" "}
                  {active.criteria.priceMax === null
                    ? "sem teto"
                    : `até ${money(active.criteria.priceMax * 100)}`}{" "}
                  · Km:{" "}
                  {active.criteria.mileageMax === null
                    ? "sem teto"
                    : `até ${number(active.criteria.mileageMax)}`}{" "}
                  ·{" "}
                  {active.criteria.privateOnly
                    ? "Somente particulares"
                    : "Particulares e profissionais"}
                </p>
                <p className="muted discovery-help">
                  Uma página por fonte. Novos e usados, salvo os demais
                  critérios. Sem FIPE ou alertas automáticos nesta etapa.
                </p>
              </>
            )}
          </div>
          {loading ? (
            <p role="status">Carregando buscas…</p>
          ) : !active ? (
            <div className="empty-state">
              <Search size={30} />
              <h2>Comece pelo carro que procura</h2>
              <p>
                Salve uma busca ao lado. Seus cadastros no catálogo continuam
                disponíveis.
              </p>
            </div>
          ) : !run ? (
            <div className="empty-state">
              <Search size={30} />
              <h2>Sua busca está pronta</h2>
              <p>
                Clique em Consultar agora para buscar nos portais selecionados.
              </p>
            </div>
          ) : (
            <>
              {failedAttemptAt && (
                <div className="discovery-stale-note" role="status">
                  A tentativa de {when(failedAttemptAt)} falhou antes de gerar
                  novos resultados. Os dados abaixo pertencem à consulta
                  anterior.
                </div>
              )}
              <p className="muted">
                Consulta armazenada em {when(run.createdAt)}. Os resultados
                abaixo pertencem somente a essa execução.
              </p>
              {run.interrupted && (
                <div className="error-box">
                  Esta consulta não foi concluída. Aguarde alguns minutos antes
                  de tentar novamente.
                </div>
              )}
              {run.sources.map((s) => (
                <div
                  key={s.source}
                  className={`panel discovery-source ${s.status === "ok" ? "" : "discovery-source-error"}`}
                >
                  <h2>
                    {sourceNames[s.source]} ·{" "}
                    {s.status === "ok"
                      ? "Consultada"
                      : s.status === "unconfigured"
                        ? "Não conectada"
                        : "Falhou"}
                  </h2>
                  {s.status === "ok" && s.partial && (
                    <p className="discovery-warning">
                      Resultado parcial: a cobertura foi limitada a uma página.
                    </p>
                  )}
                  <p>{s.message}</p>
                  {!!s.locationCredits && (
                    <p className="muted">
                      Localização automática: {s.locationCredits} crédito(s)
                      Reef reservado(s).
                    </p>
                  )}
                  {s.status === "ok" && (
                    <p className="muted">
                      {s.listings.length} recebidos ·{" "}
                      {s.total === null
                        ? "total desconhecido"
                        : `${number(s.total)} declarados pela fonte`}{" "}
                      · {(s.elapsedMs / 1000).toFixed(1)} s ·{" "}
                      {s.creditsReserved} crédito(s) reservado(s)
                    </p>
                  )}
                </div>
              ))}
              <div className="discovery-result-bar">
                <strong>
                  {eligible.length}{" "}
                  {eligible.length === 1 ? "atende" : "atendem"} aos critérios
                </strong>
                <label className="discovery-check">
                  <input
                    type="checkbox"
                    checked={showNear}
                    onChange={(e) => setShowNear(e.target.checked)}
                  />{" "}
                  Mostrar também {listings.length - eligible.length} fora dos
                  critérios
                </label>
              </div>
              {!listings.length &&
                run.sources.some((s) => s.status === "ok") && (
                  <div className="empty-state">
                    <h2>Nenhuma correspondência na consulta válida</h2>
                    <p>
                      Ao menos uma fonte respondeu sem anúncios para este
                      recorte. Confira fontes que falharam e os limites de
                      cobertura acima.
                    </p>
                  </div>
                )}
              {!run.interrupted &&
                !run.sources.some((source) => source.status === "ok") && (
                  <div className="error-box">
                    Nenhuma fonte concluiu esta tentativa. Isso não significa
                    que não existam anúncios para os critérios informados.
                  </div>
                )}
              {!!listings.length && !eligible.length && !showNear && (
                <div className="empty-state">
                  <h2>Nenhum atende a todos os critérios</h2>
                  <p>
                    Você pode examinar os demais anúncios e os motivos de
                    exclusão.
                  </p>
                </div>
              )}
              {listings
                .filter((r) => showNear || !r.reasons.length)
                .map((r) => (
                  <article
                    key={`${run.id}-${r.source}-${r.externalId}`}
                    className="panel discovery-card"
                  >
                    <div className="discovery-card-top">
                      <span className="eyebrow">
                        {sourceNames[r.source]} ·{" "}
                        {r.sellerType === "private"
                          ? "Particular"
                          : r.sellerType === "professional"
                            ? "Profissional"
                            : "Anunciante não confirmado"}
                      </span>
                      <span
                        className={
                          r.reasons.length
                            ? "discovery-warning"
                            : "discovery-good"
                        }
                      >
                        {r.reasons.length
                          ? "Fora dos critérios"
                          : "Atende aos critérios"}
                      </span>
                    </div>
                    <h2>{r.title}</h2>
                    <div className="discovery-price">{money(r.priceCents)}</div>
                    <p>
                      {r.modelYear ?? "Ano não informado"} ·{" "}
                      {r.mileage === null
                        ? "Km não informado"
                        : `${number(r.mileage)} km`}{" "}
                      ·{" "}
                      {[r.city, r.state].filter(Boolean).join(" / ") ||
                        "Local desconhecido"}
                    </p>
                    {r.isNew && (
                      <p className="muted">
                        Primeira observação no seu radar; não indica data de
                        publicação.
                      </p>
                    )}
                    {r.previousPriceCents !== null &&
                      r.previousPriceCents !== undefined &&
                      r.priceCents !== null &&
                      r.priceCents !== r.previousPriceCents && (
                        <p
                          className={
                            r.priceCents < r.previousPriceCents
                              ? "discovery-good"
                              : "discovery-warning"
                          }
                        >
                          Antes: {money(r.previousPriceCents)} ·{" "}
                          {r.priceCents < r.previousPriceCents
                            ? "Queda de"
                            : "Aumento de"}{" "}
                          {money(Math.abs(r.priceCents - r.previousPriceCents))}
                        </p>
                      )}
                    {!!r.reasons.length && (
                      <ul className="discovery-reasons">
                        {r.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    )}
                    <p className="muted">Observado em {when(r.observedAt)}</p>
                    <a
                      className="button"
                      href={r.url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Abrir anúncio original <ExternalLink size={15} />
                    </a>
                    <PriceHistory listing={r} />
                  </article>
                ))}
            </>
          )}
        </section>
      </div>
    </>
  );
}
