"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Table2,
  Heart,
  Columns3,
  X,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react";
import { useWorkspace } from "./workspace";
import { Empty, PageHeading, VehicleCard, Opportunity } from "./vehicle-ui";
import { SavedCatalogSearches } from "./saved-catalog-searches";
import {
  defaultFilters,
  states,
  money,
  number,
  location,
  fuels,
  transmissions,
  type Filters,
} from "@/lib/vehicle";
import { filterIntelligentVehicles, recentReduction } from "@/lib/intelligence";
const labels: Record<string, string> = {
  exactMatch: "Correspondência exata",
  q: "Busca",
  brand: "Marca",
  model: "Modelo",
  version: "Versão",
  yearMin: "Ano mín.",
  yearMax: "Ano máx.",
  manufactureYear: "Fabricação",
  priceMin: "Preço mín.",
  priceMax: "Preço máx.",
  mileageMax: "Km máx.",
  city: "Cidade",
  state: "Estado",
  source: "Origem",
  fuel: "Combustível",
  transmission: "Câmbio",
  favorite: "Favoritos",
  reduced: "Redução registrada",
  referenceDiscountMin: "Desconto mínimo na referência (%)",
  days: "Cadastro nos últimos dias",
  classification: "Classificação",
};
const pageSize = 12;
export function Catalog({ favorites = false }: { favorites?: boolean }) {
  const { vehicles, favorite, selected, toggleCompare } = useWorkspace();
  const searchParams = useSearchParams(),
    pathname = usePathname();
  const urlQuery = searchParams.toString();
  // Keep inputs synchronous while Next reflects native history updates.
  const [queryDraft, setQueryDraft] = useState({
    base: urlQuery,
    query: urlQuery,
  });
  if (queryDraft.base !== urlQuery)
    setQueryDraft({ base: urlQuery, query: urlQuery });
  const queryString =
    queryDraft.base === urlQuery ? queryDraft.query : urlQuery;
  const currentParams = new URLSearchParams(queryString);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "radar-last-catalog-url",
        pathname + (queryString ? "?" + queryString : ""),
      );
    } catch {
      /* Browser preferences are optional. */
    }
  }, [pathname, queryString]);
  const filters = useMemo(() => {
    const values = { ...defaultFilters, favorite: favorites };
    const query = new URLSearchParams(queryString);
    for (const key of Object.keys(values) as (keyof Filters)[]) {
      const value = query.get(key);
      if (value !== null)
        Object.assign(values, {
          [key]: typeof values[key] === "boolean" ? value === "true" : value,
        });
    }
    values.favorite = favorites || values.favorite;
    return values;
  }, [queryString, favorites]);
  const [expanded, setExpanded] = useState(false);
  const [columns, setColumns] = useState([
    "year",
    "mileage",
    "price",
    "location",
    "source",
  ]);
  const requestedView = currentParams.get("view");
  const view =
    requestedView === "list" || requestedView === "table"
      ? requestedView
      : "cards";
  function change(name: string, value: string | boolean) {
    const next = new URLSearchParams(queryString);
    if (!value || value === defaultFilters[name as keyof Filters])
      next.delete(name);
    else next.set(name, String(value));
    if (name !== "page") next.delete("page");
    setQueryDraft({ base: urlQuery, query: next.toString() });
    window.history.replaceState(
      null,
      "",
      pathname + (next.size ? "?" + next : ""),
    );
  }
  function clear() {
    setQueryDraft({
      base: urlQuery,
      query: view === "cards" ? "" : `view=${view}`,
    });
    window.history.replaceState(
      null,
      "",
      pathname + (view === "cards" ? "" : `?view=${view}`),
    );
  }
  const results = useMemo(
    () => filterIntelligentVehicles(vehicles, filters),
    [vehicles, filters],
  );
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const page = Math.min(
    totalPages,
    Math.max(1, Math.floor(Number(currentParams.get("page")) || 1)),
  );
  const visible = results.slice((page - 1) * pageSize, page * pageSize);
  const active = Object.entries(filters).filter(
    ([key, value]) =>
      key !== "sort" &&
      value !== "" &&
      value !== false &&
      !(favorites && key === "favorite"),
  );
  const rangeError =
    (filters.yearMin &&
      filters.yearMax &&
      Number(filters.yearMin) > Number(filters.yearMax)) ||
    (filters.priceMin &&
      filters.priceMax &&
      Number(filters.priceMin) > Number(filters.priceMax));
  const savedQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (
      value !== "" &&
      value !== false &&
      value !== defaultFilters[key as keyof Filters]
    )
      savedQuery.set(key, String(value));
  const reductions = favorites
    ? vehicles
        .filter((v) => v.favorite)
        .map((v) => ({ v, reduction: recentReduction(v) }))
        .filter((row) => row.reduction)
    : [];
  const input = (name: keyof Filters, label: string, numeric = false) => (
    <label key={name}>
      {label}
      <input
        name={name}
        type={numeric ? "number" : "text"}
        min="0"
        step={name.startsWith("price") ? "0.01" : "1"}
        value={String(filters[name] ?? "")}
        onChange={(e) => change(name, e.target.value)}
        placeholder="Todos"
      />
    </label>
  );
  const select = (name: keyof Filters, label: string, values: string[]) => (
    <label key={name}>
      {label}
      <select
        name={name}
        value={String(filters[name] || "")}
        onChange={(e) => change(name, e.target.value)}
      >
        <option value="">Todos</option>
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <PageHeading
        eyebrow={
          favorites ? "SEU ACOMPANHAMENTO" : "ENCONTRE. COMPARE. DECIDA."
        }
        title={favorites ? "Favoritos" : "Radar de veículos"}
        description={
          favorites
            ? "Seus veículos de interesse, buscas salvas e alterações registradas."
            : "Explore preços, compare possibilidades e encontre o que faz sentido."
        }
      >
        <Link href="/buscar" className="button">
          <Search size={15} /> Buscar nos portais <ArrowUpRight size={14} />
        </Link>
      </PageHeading>
      {favorites && (
        <>
          <SavedCatalogSearches management />
          {reductions.length > 0 && (
            <section className="panel monitoring-panel">
              <div className="section-heading">
                <h2>Reduções registradas nos favoritos</h2>
                <span className="caption">
                  ÚLTIMOS 30 DIAS · HISTÓRICO LOCAL
                </span>
              </div>
              {reductions.map(({ v, reduction }) => (
                <Link
                  key={v.id}
                  className="monitoring-row"
                  href={`/veiculos/${v.id}`}
                >
                  <span>
                    {v.brand} {v.model}
                    <small>{v.version || "Versão não informada"}</small>
                  </span>
                  <span>
                    <del>{money(reduction!.previousPriceCents)}</del>
                    <strong>{money(v.priceCents)}</strong>
                  </span>
                  <span className="positive">
                    − {money(reduction!.amountCents)} <ArrowUpRight size={14} />
                  </span>
                </Link>
              ))}
              <p className="info-note">
                Alterações de preço cadastradas; não representam confirmação de
                disponibilidade no portal.
              </p>
            </section>
          )}
        </>
      )}
      <div className="catalog-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            name="q"
            aria-label="Buscar veículos"
            placeholder="Buscar marca, modelo, versão ou cidade…"
            value={filters.q}
            onChange={(e) => change("q", e.target.value)}
          />
          {filters.q && (
            <button aria-label="Limpar busca" onClick={() => change("q", "")}>
              <X size={16} />
            </button>
          )}
        </div>
        <button
          className={"button " + (expanded ? "filter-active" : "")}
          aria-expanded={expanded}
          aria-controls="radar-filters"
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal size={16} /> Filtros{" "}
          {active.length > 0 && <span className="count">{active.length}</span>}
        </button>
      </div>
      {expanded && (
        <section
          id="radar-filters"
          className="filter-panel"
          aria-label="Filtros de veículos"
        >
          <div className="filter-grid">
            {input("brand", "Marca")}
            {input("model", "Modelo")}
            {input("version", "Versão")}
            {input("yearMin", "Ano mínimo", true)}
            {input("yearMax", "Ano máximo", true)}
            {input("manufactureYear", "Ano de fabricação", true)}
            {input("priceMin", "Preço mínimo (R$)", true)}
            {input("priceMax", "Preço máximo (R$)", true)}
            {input("mileageMax", "Km máxima", true)}
            {input("city", "Cidade")}
            {select("state", "Estado", states)}
            {input("source", "Origem")}
            {select("fuel", "Combustível", fuels)}
            {select("transmission", "Câmbio", transmissions)}
            {input(
              "referenceDiscountMin",
              "Desconto na referência mín. (%)",
              true,
            )}
            <label>
              Data de cadastro
              <select
                name="days"
                value={filters.days}
                onChange={(e) => change("days", e.target.value)}
              >
                <option value="">Todo o período</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
                <option value="365">Últimos 365 dias</option>
              </select>
            </label>
            <label>
              Classificação
              <select
                name="classification"
                value={filters.classification}
                onChange={(e) => change("classification", e.target.value)}
              >
                <option value="">Todas</option>
                <option value="opportunities">
                  Oportunidades fortes e potenciais
                </option>
                <option value="strong">Oportunidade forte</option>
                <option value="potential">Potencial oportunidade</option>
                <option value="aligned">Preço alinhado aos comparáveis</option>
                <option value="above">Acima dos comparáveis</option>
                <option value="insufficient">Dados insuficientes</option>
              </select>
            </label>
          </div>
          <div className="filter-footer">
            <div className="filter-checks">
              {!favorites && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.favorite}
                    onChange={(e) => change("favorite", e.target.checked)}
                  />
                  Somente favoritos
                </label>
              )}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={filters.reduced}
                  onChange={(e) => change("reduced", e.target.checked)}
                />
                Com redução registrada
              </label>
            </div>
            <button className="text-button" onClick={clear}>
              Limpar filtros
            </button>
          </div>
          {rangeError && (
            <p role="alert" className="field-error">
              O valor mínimo deve ser menor ou igual ao máximo.
            </p>
          )}
          <p className="info-note">
            A referência é manual. Classificações usam comparáveis do catálogo e
            critérios documentados em Configurações.
          </p>
        </section>
      )}
      {active.length > 0 && (
        <div className="filter-chips">
          {active.map(([key, value]) => (
            <span className="filter-chip" key={key}>
              {labels[key] || key}
              {value === true ? "" : `: ${value}`}
              <button
                aria-label={`Remover filtro ${labels[key] || key}`}
                onClick={() =>
                  change(key, typeof value === "boolean" ? false : "")
                }
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button onClick={clear} className="text-button">
            Limpar filtros
          </button>
        </div>
      )}
      <div className="radar-saving">
        <span className="sample-note">
          Catálogo cadastrado · {number(vehicles.length)} anúncios no total
        </span>
        <SavedCatalogSearches query={savedQuery.toString()} />
      </div>
      <div className="results-bar">
        <span aria-live="polite">
          <strong>{results.length}</strong>{" "}
          {results.length === 1 ? "veículo encontrado" : "veículos encontrados"}
        </span>
        <div className="results-options">
          <select
            aria-label="Ordenar veículos"
            name="sort"
            value={filters.sort}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="recent">Mais recentes</option>
            <option value="priceAsc">Menor preço</option>
            <option value="priceDesc">Maior preço</option>
            <option value="mileage">Menor quilometragem</option>
            <option value="year">Maior ano</option>
            <option value="referenceDiscount">Desconto na referência</option>
            <option value="opportunity">Classificação</option>
            <option value="reduction">Maior redução registrada</option>
          </select>
          <div className="view-switch">
            {(
              [
                ["cards", "cards", LayoutGrid],
                ["list", "lista", List],
                ["table", "tabela", Table2],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                aria-label={`Visualização em ${label}`}
                aria-pressed={view === key}
                className={view === key ? "active" : ""}
                onClick={() => change("view", key)}
              >
                <Icon size={17} />
              </button>
            ))}
          </div>
        </div>
      </div>
      {!results.length ? (
        <Empty
          title={
            vehicles.length
              ? "Nenhum veículo por aqui"
              : "Seu catálogo está pronto para começar"
          }
          description={
            vehicles.length
              ? "Ajuste os filtros ou adicione anúncios aos seus favoritos."
              : "Cadastre um anúncio real ou consulte os portais para encontrar veículos."
          }
          action={!vehicles.length}
        />
      ) : view !== "table" ? (
        <div className={view === "list" ? "cards compact-list" : "cards"}>
          {visible.map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
          ))}
        </div>
      ) : (
        <>
          <details className="table-columns">
            <summary className="button small">
              Colunas <ChevronDown size={14} />
            </summary>
            <div>
              {[
                ["year", "Ano"],
                ["mileage", "Quilometragem"],
                ["price", "Preço e referência"],
                ["location", "Localização"],
                ["source", "Origem"],
              ].map(([key, label]) => (
                <label className="checkbox-label" key={key}>
                  <input
                    type="checkbox"
                    checked={columns.includes(key)}
                    onChange={() =>
                      setColumns((old) =>
                        old.includes(key)
                          ? old.filter((k) => k !== key)
                          : [...old, key],
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Tabela de veículos"
          >
            <table>
              <thead>
                <tr>
                  <th>Veículo</th>
                  {columns.includes("year") && <th>Ano</th>}
                  {columns.includes("mileage") && <th>Quilometragem</th>}
                  {columns.includes("price") && (
                    <th>Preço / referência manual</th>
                  )}
                  {columns.includes("location") && <th>Localização</th>}
                  {columns.includes("source") && <th>Origem</th>}
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link className="table-title" href={`/veiculos/${v.id}`}>
                        {v.brand} {v.model}
                      </Link>
                      <small>{v.version || "—"}</small>
                    </td>
                    {columns.includes("year") && <td>{v.modelYear}</td>}
                    {columns.includes("mileage") && (
                      <td>{number(v.mileage)} km</td>
                    )}
                    {columns.includes("price") && (
                      <td>
                        <strong>{money(v.priceCents)}</strong>
                        <Opportunity vehicle={v} />
                      </td>
                    )}
                    {columns.includes("location") && <td>{location(v)}</td>}
                    {columns.includes("source") && <td>{v.source}</td>}
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="icon-button"
                          aria-label={
                            v.favorite
                              ? "Remover dos favoritos"
                              : "Adicionar aos favoritos"
                          }
                          aria-pressed={v.favorite}
                          onClick={() => void favorite(v)}
                        >
                          <Heart
                            size={17}
                            fill={v.favorite ? "currentColor" : "none"}
                          />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Selecionar para comparar"
                          aria-pressed={selected.includes(v.id)}
                          onClick={() => toggleCompare(v.id)}
                        >
                          <Columns3 size={17} />
                        </button>
                        {v.originalUrl && (
                          <a
                            href={v.originalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="icon-button"
                            aria-label="Abrir anúncio original"
                          >
                            <ArrowUpRight size={17} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {results.length > 0 && (
        <nav className="pagination" aria-label="Paginação do radar">
          <span>
            {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, results.length)} de {results.length}{" "}
            anúncios
          </span>
          <div>
            <button
              className="button small"
              disabled={page <= 1}
              onClick={() => change("page", String(page - 1))}
              aria-label="Página anterior"
            >
              <ArrowLeft size={14} />
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              className="button small"
              disabled={page >= totalPages}
              onClick={() => change("page", String(page + 1))}
              aria-label="Próxima página"
            >
              <ArrowRight size={14} />
            </button>
          </div>
        </nav>
      )}
    </>
  );
}
