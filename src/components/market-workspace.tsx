"use client";
import { commercialModelName } from "@/lib/commercial-names";

import {
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Download, Info, X } from "lucide-react";
import { useWorkspace } from "./workspace";
import { defaultFilters, money, number, type Vehicle } from "@/lib/vehicle";
import { filterIntelligentVehicles, marketSummary } from "@/lib/intelligence";

const filterKeys = [
  "q",
  "brand",
  "model",
  "version",
  "state",
  "source",
  "yearMin",
  "yearMax",
  "priceMin",
  "priceMax",
  "days",
] as const;
type MarketKey = (typeof filterKeys)[number];
type MarketFilters = Record<MarketKey, string>;
type Summary = ReturnType<typeof marketSummary>;
type Bin = Summary["distribution"][number];
const filterLabels: Record<MarketKey, string> = {
  q: "Busca",
  brand: "Marca",
  model: "Modelo",
  version: "Versão",
  state: "UF",
  source: "Fonte",
  yearMin: "Ano mínimo",
  yearMax: "Ano máximo",
  priceMin: "Preço mínimo",
  priceMax: "Preço máximo",
  days: "Dias desde o cadastro",
};
const percentage = (value: number | null) =>
  value == null
    ? "—"
    : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
const compactMoney = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(cents / 100);
const date = (value: string | null | undefined) =>
  !value || !Number.isFinite(Date.parse(value))
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(value));
const unique = (vehicles: Vehicle[], key: keyof Vehicle) =>
  [
    ...new Set(
      vehicles
        .map((v) =>
          key === "model" ? commercialModelName(v.brand, v.model) : v[key],
        )
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

function queryFor(
  filters: MarketFilters,
  changes: Partial<MarketFilters> = {},
) {
  return new URLSearchParams(
    Object.entries({ ...filters, ...changes }).filter(
      ([, value]) => value !== "",
    ),
  ).toString();
}
function routeFor(
  path: string,
  filters: MarketFilters,
  changes: Partial<MarketFilters> = {},
) {
  const query = new URLSearchParams(queryFor(filters, changes));
  if (path === "/veiculos") query.set("exactMatch", "true");
  return path + (query.size ? `?${query}` : "");
}

function FilterForm({
  filters,
  vehicles,
  onApply,
}: {
  filters: MarketFilters;
  vehicles: Vehicle[];
  onApply: (filters: MarketFilters) => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState("");
  const change = (name: MarketKey, value: string) =>
    setDraft((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "brand"
        ? { model: "", version: "" }
        : name === "model"
          ? { version: "" }
          : {}),
    }));
  const byBrand = vehicles.filter(
    (v) => !draft.brand || v.brand === draft.brand,
  );
  const byModel = byBrand.filter(
    (v) =>
      !draft.model ||
      v.model === draft.model ||
      commercialModelName(v.brand, v.model) === draft.model,
  );
  const select = (
    name: MarketKey,
    label: string,
    values: string[],
    placeholder = "Todos",
  ) => (
    <label className="market-field">
      <span>{label}</span>
      <select
        name={name}
        value={draft[name]}
        onChange={(event) => change(name, event.target.value)}
      >
        <option value="">{placeholder}</option>
        {[...new Set([...values, ...(draft[name] ? [draft[name]] : [])])].map(
          (value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ),
        )}
      </select>
    </label>
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.yearMin && draft.yearMax && +draft.yearMin > +draft.yearMax) {
      setError("O ano mínimo deve ser menor ou igual ao máximo.");
      return;
    }
    if (draft.priceMin && draft.priceMax && +draft.priceMin > +draft.priceMax) {
      setError("O preço mínimo deve ser menor ou igual ao máximo.");
      return;
    }
    setError("");
    onApply(draft);
  };
  return (
    <form
      className="market-filter-form panel"
      aria-label="Filtros da análise de mercado"
      onSubmit={submit}
    >
      <div className="market-filter-top">
        {select("brand", "Marca", unique(vehicles, "brand"))}
        {select("model", "Modelo", unique(byBrand, "model"))}
        {select("state", "Estado", unique(vehicles, "state"))}
        <label className="market-field">
          <span>Cadastro no catálogo</span>
          <select
            name="days"
            value={draft.days}
            onChange={(event) => change("days", event.target.value)}
          >
            <option value="">Todo o período</option>
            {[7, 30, 90, 365].map((days) => (
              <option key={days} value={String(days)}>
                Últimos {days} dias
              </option>
            ))}
            {draft.days && !["7", "30", "90", "365"].includes(draft.days) && (
              <option value={draft.days}>Últimos {draft.days} dias</option>
            )}
          </select>
        </label>
        <button className="button primary" type="submit">
          Aplicar filtros
        </button>
      </div>
      <details
        className="market-advanced-filters"
        open={
          [
            "version",
            "source",
            "yearMin",
            "yearMax",
            "priceMin",
            "priceMax",
            "q",
          ].some((key) => filters[key as MarketKey]) || undefined
        }
      >
        <summary>
          Mais filtros <span aria-hidden="true">+</span>
        </summary>
        <div className="market-filter-extra">
          {select("version", "Versão", unique(byModel, "version"))}
          {select("source", "Fonte", unique(vehicles, "source"))}
          {(["yearMin", "yearMax", "priceMin", "priceMax"] as const).map(
            (name) => (
              <label className="market-field" key={name}>
                <span>
                  {filterLabels[name]}
                  {name.startsWith("price") ? " · R$" : " / modelo"}
                </span>
                <input
                  name={name}
                  type="number"
                  min={name.startsWith("price") ? "0" : "1900"}
                  max={
                    name.startsWith("year")
                      ? new Date().getFullYear() + 2
                      : undefined
                  }
                  step={name.startsWith("price") ? "0.01" : "1"}
                  inputMode={name.startsWith("price") ? "decimal" : "numeric"}
                  value={draft[name]}
                  onChange={(event) => change(name, event.target.value)}
                  placeholder="Sem limite"
                />
              </label>
            ),
          )}
          <label className="market-field market-search-field">
            <span>Busca na amostra</span>
            <input
              name="q"
              type="search"
              value={draft.q}
              onChange={(event) => change("q", event.target.value)}
              placeholder="Marca, modelo, versão ou cidade"
            />
          </label>
        </div>
      </details>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </form>
  );
}

function ChartEmpty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="market-chart-empty">
      <span className="market-empty-rule" aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function Distribution({
  bins,
  filters,
}: {
  bins: Bin[];
  filters: MarketFilters;
}) {
  if (!bins.length)
    return (
      <ChartEmpty title="Sem distribuição disponível">
        Os preços válidos dos anúncios filtrados aparecerão aqui.
      </ChartEmpty>
    );
  const maximum = Math.max(...bins.map((bin) => bin.count));
  const peak = bins.findIndex((bin) => bin.count === maximum);
  const range = (bin: Bin) => ({
    min: bin.minCents,
    max: bin.maxCents,
  });
  return (
    <>
      <div
        className="market-histogram"
        role="group"
        aria-label="Quantidade de anúncios por faixa de preço"
      >
        {bins.map((bin, index) => {
          const { min, max } = range(bin);
          return (
            <div className="market-bin" key={index}>
              <Link
                className={`market-bin-bar${index === peak ? " is-peak" : ""}`}
                style={
                  {
                    "--bar-size": `${(bin.count / maximum) * 100}%`,
                  } as CSSProperties
                }
                href={routeFor("/veiculos", filters, {
                  priceMin: String(min / 100),
                  priceMax: String(max / 100),
                })}
                aria-label={`${money(min)} a ${money(max)}: ${number(bin.count)} anúncios. Abrir radar nesta faixa.`}
              >
                <span>{number(bin.count)}</span>
              </Link>
              <span className="market-bin-label">{compactMoney(min)}</span>
            </div>
          );
        })}
      </div>
      <div className="market-chart-axis">
        <span>Preço anunciado · R$</span>
        <span>Selecione uma faixa para abrir o radar</span>
      </div>
      <details className="market-data-details">
        <summary>Ver valores da distribuição</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Faixa de preço</th>
                <th scope="col">Anúncios</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((bin, index) => (
                <tr key={index}>
                  <td>
                    {money(range(bin).min)} – {money(range(bin).max)}
                  </td>
                  <td>{number(bin.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function Scatter({ vehicles }: { vehicles: Vehicle[] }) {
  const [readout, setReadout] = useState("");
  const router = useRouter();
  const eligible = useMemo(
    () =>
      vehicles
        .filter(
          (v) =>
            Number.isFinite(v.mileage) &&
            Number.isFinite(v.priceCents) &&
            v.priceCents > 0 &&
            v.mileage >= 0,
        )
        .toSorted((a, b) => a.priceCents - b.priceCents),
    [vehicles],
  );
  if (eligible.length < 3)
    return (
      <ChartEmpty title="Preço encontra quilometragem">
        Cadastre pelo menos 3 anúncios com preço e quilometragem para visualizar
        a dispersão.
      </ChartEmpty>
    );
  const points =
    eligible.length > 400
      ? Array.from(
          { length: 400 },
          (_, i) => eligible[Math.round((i * (eligible.length - 1)) / 399)],
        )
      : eligible;
  const maximumMileage = Math.max(...eligible.map((v) => v.mileage), 1);
  const minPrice = Math.min(...eligible.map((v) => v.priceCents));
  const maxPrice = Math.max(...eligible.map((v) => v.priceCents));
  const padding = Math.max(maxPrice - minPrice, maxPrice * 0.1, 100) * 0.15;
  const low = Math.max(0, minPrice - padding);
  const high = maxPrice + padding;
  const x = (value: number) => 110 + (value / maximumMileage) * 560;
  const y = (value: number) => 228 - ((value - low) / (high - low)) * 194;
  return (
    <>
      <svg
        className="market-scatter"
        viewBox="0 0 720 280"
        role="group"
        aria-label="Dispersão de preço anunciado em reais por quilometragem"
      >
        <title>Preço anunciado × quilometragem</title>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1="110"
              y1={y(low + (high - low) * t)}
              x2="670"
              y2={y(low + (high - low) * t)}
              className="market-grid-line"
            />
            <text
              x="98"
              y={y(low + (high - low) * t) + 4}
              textAnchor="end"
              className="market-axis-text"
            >
              {compactMoney(low + (high - low) * t)}
            </text>
            <text
              x={x(maximumMileage * t)}
              y="257"
              textAnchor={t === 1 ? "end" : t === 0 ? "start" : "middle"}
              className="market-axis-text"
            >
              {number(Math.round(maximumMileage * t))} km
            </text>
          </g>
        ))}
        {points.map((v) => {
          const description = `${v.brand} ${v.model} ${v.modelYear}: ${money(v.priceCents)}, ${number(v.mileage)} km`;
          return (
            <circle
              key={v.id}
              className="market-scatter-dot"
              cx={x(v.mileage)}
              cy={y(v.priceCents)}
              r="4"
              tabIndex={0}
              role="link"
              aria-label={`${description}. Abrir detalhes`}
              onMouseEnter={() => setReadout(description)}
              onFocus={() => setReadout(description)}
              onClick={() =>
                router.push(`/veiculos/${encodeURIComponent(v.id)}`)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(`/veiculos/${encodeURIComponent(v.id)}`);
                }
              }}
            >
              <title>{description}</title>
            </circle>
          );
        })}
      </svg>
      <p className="market-chart-readout" aria-live="polite">
        {readout ||
          "Passe o cursor ou use Tab para explorar. Enter abre o anúncio."}
      </p>
      <p className="market-chart-footnote">
        {number(eligible.length)} anúncios com quilometragem informada.
        {eligible.length > 400
          ? " Exibidos 400 pontos distribuídos pela faixa de preços; o CSV contém a amostra completa."
          : ""}{" "}
        Esta relação não mede demanda ou valor de venda.
      </p>
      <details className="market-data-details">
        <summary>Consultar anúncios da dispersão</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Veículo</th>
                <th scope="col">Km</th>
                <th scope="col">Preço anunciado</th>
              </tr>
            </thead>
            <tbody>
              {eligible.slice(0, 100).map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link href={`/veiculos/${encodeURIComponent(v.id)}`}>
                      {v.brand} {v.model} · {v.modelYear}
                    </Link>
                  </td>
                  <td>{number(v.mileage)}</td>
                  <td>{money(v.priceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {eligible.length > 100 && (
          <p className="market-chart-footnote">
            Primeiros 100 por preço. Exporte o CSV para consultar todos.
          </p>
        )}
      </details>
    </>
  );
}

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
function exportSample(vehicles: Vehicle[]) {
  const heading = [
    "Marca",
    "Modelo",
    "Versão",
    "Ano/modelo",
    "Preço anunciado (BRL)",
    "Referência manual (BRL)",
    "Km",
    "Cidade",
    "UF",
    "Fonte",
    "Cadastro local",
    "URL original",
  ];
  const rows = vehicles.map((v) => [
    v.brand,
    v.model,
    v.version,
    v.modelYear,
    (v.priceCents / 100).toFixed(2),
    v.referenceCents == null ? "" : (v.referenceCents / 100).toFixed(2),
    v.mileage,
    v.city,
    v.state,
    v.source,
    v.createdAt,
    v.originalUrl,
  ]);
  const content =
    "\uFEFF" +
    [heading, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `radar-amostra-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MarketWorkspace() {
  const { vehicles, notify } = useWorkspace();
  const router = useRouter();
  const query = useSearchParams().toString();
  const filters = useMemo(() => {
    const params = new URLSearchParams(query);
    return Object.fromEntries(
      filterKeys.map((key) => [key, params.get(key) || ""]),
    ) as MarketFilters;
  }, [query]);
  const results = useMemo(
    () =>
      filterIntelligentVehicles(
        vehicles,
        { ...defaultFilters, ...filters, exactMatch: true },
        { universe: vehicles },
      ),
    [vehicles, filters],
  );
  const summary = useMemo(
    () => marketSummary(results, { universe: vehicles }),
    [results, vehicles],
  );
  const groups = useMemo(
    () => [...summary.groups].sort((a, b) => b.count - a.count),
    [summary],
  );
  const [groupPagination, setGroupPagination] = useState({
    query: "",
    page: 1,
  });
  const groupPages = Math.max(1, Math.ceil(groups.length / 20));
  const groupPage =
    groupPagination.query === query
      ? Math.min(groupPagination.page, groupPages)
      : 1;
  const visibleGroups = groups.slice((groupPage - 1) * 20, groupPage * 20);
  const active = Object.entries(filters).filter(([, value]) => value) as [
    MarketKey,
    string,
  ][];
  const apply = (next: MarketFilters) =>
    router.push(routeFor("/mercado", next), { scroll: false });
  const clear = () => router.push("/mercado", { scroll: false });
  const latest = summary.latestPriceRecord;
  return (
    <div className="market-page">
      <header className="market-page-heading">
        <div>
          <p className="eyebrow">INTELIGÊNCIA DE MERCADO</p>
          <h1>
            O mercado,
            <br />
            <span>em perspectiva.</span>
          </h1>
          <p className="muted">
            Explore preços, comparáveis e oportunidades na sua amostra.
          </p>
        </div>
        <button
          className="button"
          disabled={!results.length}
          onClick={() => {
            exportSample(results);
            notify(`${number(results.length)} anúncios exportados em CSV.`);
          }}
        >
          <Download size={15} /> Exportar amostra
        </button>
      </header>
      <FilterForm
        key={query}
        filters={filters}
        vehicles={vehicles}
        onApply={apply}
      />
      {active.length > 0 && (
        <div className="market-filter-chips" aria-label="Filtros aplicados">
          {active.map(([key, value]) => (
            <button
              key={key}
              className="market-filter-chip"
              onClick={() =>
                apply({
                  ...filters,
                  [key]: "",
                  ...(key === "brand"
                    ? { model: "", version: "" }
                    : key === "model"
                      ? { version: "" }
                      : {}),
                })
              }
              aria-label={`Remover filtro ${filterLabels[key]}: ${value}`}
            >
              {filterLabels[key]}: {value}
              <X size={12} />
            </button>
          ))}
          <button className="text-button" onClick={clear}>
            Limpar filtros
          </button>
        </div>
      )}
      {!vehicles.length ? (
        <section className="panel market-onboarding">
          <div className="market-onboarding-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="eyebrow">A ANÁLISE COMEÇA COM BOAS FONTES</p>
          <h2>
            Cada observação,
            <br />
            uma decisão mais informada.
          </h2>
          <p>
            Cadastre os anúncios que deseja acompanhar. Preços, comparáveis e
            diferenças em relação às suas referências formarão uma visão
            consistente do seu catálogo.
          </p>
          <Link className="button primary" href="/veiculos/novo">
            Cadastrar primeiro anúncio <ArrowUpRight size={16} />
          </Link>
          <div className="market-onboarding-notes">
            <span>01 · Preços anunciados</span>
            <span>02 · Comparáveis verificáveis</span>
            <span>03 · Histórico preservado</span>
          </div>
        </section>
      ) : !results.length ? (
        <section className="panel market-no-results">
          <p className="eyebrow">NENHUM RESULTADO</p>
          <h2>Amplie seu campo de análise.</h2>
          <p className="muted">
            Nenhum anúncio corresponde à combinação de filtros. Remova um filtro
            para explorar o restante da sua amostra.
          </p>
          <button className="button primary" onClick={clear}>
            Limpar filtros
          </button>
        </section>
      ) : (
        <>
          <div className="market-sample-context">
            <span>
              <span className="market-context-dot" aria-hidden="true" />
              CATÁLOGO CADASTRADO · {number(summary.count)} de{" "}
              {number(vehicles.length)} anúncios
            </span>
            <span>
              {filters.days
                ? `Cadastros dos últimos ${filters.days} dias`
                : "Todo o período de cadastro"}{" "}
              · Último preço registrado {date(latest)}
            </span>
          </div>
          <section
            className="market-metrics"
            aria-label="Indicadores da amostra filtrada"
          >
            <article>
              <span>Anúncios no recorte</span>
              <strong>{number(summary.count)}</strong>
              <small>
                {number(summary.opportunitiesCount)} com potencial segundo
                comparáveis
              </small>
            </article>
            <article>
              <span>Preço mediano</span>
              <strong>
                {summary.medianPriceCents == null
                  ? "—"
                  : money(summary.medianPriceCents)}
              </strong>
              <small>Preços anunciados no catálogo</small>
            </article>
            <article>
              <span>Desconto mediano</span>
              <strong
                className={
                  summary.medianReferenceDiscount != null &&
                  summary.medianReferenceDiscount > 0
                    ? "market-positive"
                    : ""
                }
              >
                {percentage(summary.medianReferenceDiscount)}
              </strong>
              <small>
                Vs. {number(summary.referenceCount)} referências manuais · não
                FIPE
              </small>
            </article>
            <article>
              <span>Reduções recentes</span>
              <strong>{number(summary.reducedCount)}</strong>
              <small>Quedas registradas nos últimos 30 dias</small>
            </article>
          </section>
          <div className="market-chart-grid">
            <section className="panel market-chart-panel">
              <header className="section-heading">
                <div>
                  <p className="eyebrow">FAIXAS DE PREÇO</p>
                  <h2>Onde a oferta se concentra</h2>
                </div>
                <span className="market-chart-unit">Anúncios</span>
              </header>
              <Distribution bins={summary.distribution} filters={filters} />
            </section>
            <section className="panel market-chart-panel">
              <header className="section-heading">
                <div>
                  <p className="eyebrow">RELAÇÃO ENTRE ATRIBUTOS</p>
                  <h2>Preço × quilometragem</h2>
                </div>
              </header>
              <Scatter key={query} vehicles={results} />
            </section>
          </div>
          <section className="panel market-groups-panel">
            <header className="section-heading">
              <div>
                <p className="eyebrow">EXPLORAÇÃO POR MODELO</p>
                <h2>Da visão ampla ao próximo anúncio.</h2>
              </div>
              <span className="market-chart-unit">
                {number(groups.length)} grupos observados
              </span>
            </header>
            <div className="table-scroll">
              <table className="market-model-table">
                <caption className="market-visually-hidden">
                  Modelos da amostra filtrada. Classificações usam comparáveis
                  da base completa.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Marca / modelo</th>
                    <th scope="col">Anúncios</th>
                    <th scope="col">Preço mediano</th>
                    <th scope="col">Potenciais oportunidades</th>
                    <th scope="col">Desconto vs. ref. manual</th>
                    <th scope="col">
                      <span className="market-visually-hidden">Explorar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGroups.map((group) => (
                    <tr key={group.key}>
                      <th scope="row">
                        <span className="market-model-make">{group.brand}</span>
                        <span className="market-model-name">{group.model}</span>
                      </th>
                      <td>
                        <span className="market-volume-cell">
                          <span>{number(group.count)}</span>
                          <span
                            className="market-volume-track"
                            aria-hidden="true"
                          >
                            <span
                              style={{
                                width: `${groups[0]?.count ? (group.count / groups[0].count) * 100 : 0}%`,
                              }}
                            />
                          </span>
                        </span>
                      </td>
                      <td>{money(group.medianPriceCents)}</td>
                      <td
                        className={
                          group.opportunitiesCount
                            ? "market-positive"
                            : undefined
                        }
                      >
                        {number(group.opportunitiesCount)}
                      </td>
                      <td>{percentage(group.medianReferenceDiscount)}</td>
                      <td>
                        <Link
                          className="button small"
                          href={routeFor("/veiculos", filters, {
                            brand: group.brand,
                            model: group.model,
                          })}
                          aria-label={`Ver anúncios de ${group.brand} ${group.model}`}
                        >
                          Explorar <ArrowUpRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {groupPages > 1 && (
              <nav
                className="market-pagination"
                aria-label="Paginação dos modelos"
              >
                <p>
                  Mostrando {number((groupPage - 1) * 20 + 1)}–
                  {number(Math.min(groupPage * 20, groups.length))} de{" "}
                  {number(groups.length)} modelos
                </p>
                <div>
                  <button
                    className="button small"
                    disabled={groupPage === 1}
                    onClick={() =>
                      setGroupPagination({ query, page: groupPage - 1 })
                    }
                  >
                    Anterior
                  </button>
                  <span aria-live="polite">
                    Página {groupPage} de {groupPages}
                  </span>
                  <button
                    className="button small"
                    disabled={groupPage === groupPages}
                    onClick={() =>
                      setGroupPagination({ query, page: groupPage + 1 })
                    }
                  >
                    Próxima
                  </button>
                </div>
              </nav>
            )}
            <p className="market-chart-footnote">
              O volume representa anúncios cadastrados, não vendas. A referência
              manual é informada por você. Oportunidades exigem comparáveis
              equivalentes e amostra suficiente; o desconto isolado não
              determina a classificação.
            </p>
          </section>
          <section className="market-method-panel panel">
            <div>
              <p className="eyebrow">LEITURA COM CRITÉRIO</p>
              <h2>Uma amostra. Limites claros.</h2>
              <p>
                O contexto dos comparáveis permanece o mesmo ao mudar os
                filtros. A seleção altera o recorte, sem recalcular uma
                oportunidade a partir de uma amostra artificialmente menor.
              </p>
            </div>
            <details>
              <summary>Como interpretar os indicadores</summary>
              <ul>
                <li>
                  <strong>Mediana:</strong> valor central dos preços anunciados
                  no recorte; não estima o preço de fechamento.
                </li>
                <li>
                  <strong>Desconto:</strong> (referência manual − preço
                  anunciado) ÷ referência manual. Valor negativo significa preço
                  acima da referência; só entram anúncios com referência
                  informada.
                </li>
                <li>
                  <strong>Comparáveis:</strong> mesma marca, modelo, versão,
                  ano/modelo, combustível e UF; o próprio anúncio é excluído.
                  Observações antigas, amostras pequenas e dispersão excessiva
                  limitam a análise.
                </li>
                <li>
                  <strong>Redução:</strong> queda real registrada no histórico
                  de preço nos últimos 30 dias; favoritar ou editar outros dados
                  não conta como observação de preço.
                </li>
                <li>
                  <strong>Histórico:</strong> consulte a trajetória completa nos
                  detalhes de cada veículo. Não é apresentada uma tendência de
                  mercado a partir de registros parciais.
                </li>
              </ul>
            </details>
          </section>
          <footer className="market-method-note">
            <Info size={16} />
            <p>
              Este recorte reúne seu catálogo, sujeito a viés de cobertura.
              Descobertas dos portais permanecem na busca até serem cadastradas.
              Preço anunciado não é preço negociado; quantidade de anúncios não
              mede demanda nem liquidez.
            </p>
          </footer>
        </>
      )}
    </div>
  );
}
