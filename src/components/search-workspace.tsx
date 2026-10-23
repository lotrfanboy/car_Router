"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Radio } from "lucide-react";
import {
  searchSchema,
  criteriaLocation,
  listingMatchStatus,
  sourceNames,
  type SearchCriteria,
  type SearchResult,
  type Source,
} from "@/lib/discovery";
import { sortListings } from "@/lib/listing-comparison";
import { matchesResultVersion, resultVersionFacets } from "@/lib/result-facets";
import { states } from "@/lib/vehicle";
import { ListingCard, observedWhen } from "./listing-card";
import { SearchCombobox, type SearchOption } from "./search-combobox";
type Run = SearchResult & {
  id: string;
  createdAt: string;
  interrupted?: boolean;
  cached?: boolean;
};
type Saved = {
  id: string;
  criteria: SearchCriteria;
  latest: Run | null;
  lastSuccessful?: Run | null;
  previousSourceRuns?: Run[];
  criteriaMigrationNotice?: string;
};
type Integration = {
  source: Source;
  configured: boolean;
  configurationMessage?: string;
  cost: number;
  reservedToday: number;
  dailyLimit: number;
  lastSuccessfulAt: string | null;
};
type DisplayResult = { searchId: string; criteria: SearchCriteria; run: Run };
type Draft = {
  brand: string;
  model: string;
  city: string;
  cities: string[];
  state: string;
  yearMin: string;
  yearMax: string;
  mileageMax: string;
  priceMax: string;
  privateOnly: boolean;
  sources: Source[];
};
const emptyDraft = (): Draft => ({
  brand: "",
  model: "",
  city: "",
  cities: [],
  state: "PR",
  yearMin: "",
  yearMax: "",
  mileageMax: "",
  priceMax: "",
  privateOnly: false,
  sources: ["olx", "webmotors"],
});
const draftFrom = (criteria: SearchCriteria): Draft => ({
  ...criteria,
  city: "",
  cities:
    criteria.locationMode === "state"
      ? []
      : criteria.cities?.length
        ? criteria.cities
        : criteria.city
          ? [criteria.city]
          : [],
  yearMin: String(criteria.yearMin ?? ""),
  yearMax: String(criteria.yearMax ?? ""),
  mileageMax: String(criteria.mileageMax ?? ""),
  priceMax: String(criteria.priceMax ?? ""),
});
const hasSuccess = (run?: Run | null) =>
  !!run &&
  !run.interrupted &&
  run.sources.some((source) => source.status === "ok");
async function readSearches(): Promise<{
  searches: Saved[];
  integrations: Integration[];
}> {
  const response = await fetch("/api/searches", { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar suas buscas.");
  return response.json();
}
function useCatalog(url: string | null) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    url: string;
    retry: number;
    options: SearchOption[];
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const options = await response.json();
        if (!Array.isArray(options)) throw new Error();
        if (!controller.signal.aborted)
          setResult({ url, retry, options, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ url, retry, options: [], failed: true });
      });
    return () => controller.abort();
  }, [url, retry]);
  const current = result?.url === url && result?.retry === retry;
  return {
    options: current ? result.options : [],
    loading: !!url && !current,
    error: current && result.failed,
    onRetry: () => setRetry((value) => value + 1),
  };
}
export function SearchWorkspace({
  initialSearchId = "",
}: {
  initialSearchId?: string;
}) {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selected, setSelected] = useState(initialSearchId);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [brandChoice, setBrandChoice] = useState<SearchOption | null>(null);
  const [modelChoice, setModelChoice] = useState<SearchOption | null>(null);
  const [versionFilter, setVersionFilter] = useState<{
    runId: string;
    value: string;
  } | null>(null);
  const [manualBrand, setManualBrand] = useState(false);
  const [manualModel, setManualModel] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [display, setDisplay] = useState<DisplayResult | null>(null);
  const [historical, setHistorical] = useState<DisplayResult[]>([]);
  const [attempt, setAttempt] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sort, setSort] = useState<"discount" | "price" | "recent">("recent");
  const pending = useRef(false);
  const { brand, model, city, cities, state } = draft;
  const locationMode = cities.length ? "cities" : "state";
  const brandCatalog = useCatalog("/api/search-options?type=brands");
  // Only a committed catalog choice requests models; typing never does.
  const modelCatalog = useCatalog(
    brandChoice
      ? `/api/search-options?type=models&brand=${encodeURIComponent(brandChoice.code)}`
      : null,
  );
  const cityCatalog = useCatalog(
    `/api/search-options?type=cities&state=${encodeURIComponent(state)}`,
  );
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function loadSaved(row?: Saved) {
    setSelected(row?.id ?? "");
    setVersionFilter(null);
    setDraft(row ? draftFrom(row.criteria) : emptyDraft());
    const catalog =
      row?.criteria.catalog?.provider === "carrouter"
        ? row.criteria.catalog
        : undefined;
    setBrandChoice(
      catalog
        ? {
            code: catalog.brandCode,
            name: catalog.brandName,
            provider: "carrouter",
            revision: catalog.revision,
          }
        : null,
    );
    setModelChoice(
      catalog?.modelCode
        ? {
            code: catalog.modelCode,
            name: row!.criteria.model,
            provider: "carrouter",
            revision: catalog.revision,
          }
        : null,
    );
    setManualBrand(!!row && !catalog);
    setManualModel(!!row && !catalog?.modelCode);
    setAdvancedOpen(
      Boolean(
        row?.criteria.yearMin ||
        row?.criteria.yearMax ||
        row?.criteria.mileageMax ||
        row?.criteria.priceMax ||
        row?.criteria.privateOnly,
      ),
    );
    const run = hasSuccess(row?.latest) ? row!.latest : row?.lastSuccessful;
    setDisplay(
      row && run ? { searchId: row.id, criteria: row.criteria, run } : null,
    );
    setHistorical(
      row
        ? (
            row.previousSourceRuns ??
            (row.lastSuccessful ? [row.lastSuccessful] : [])
          ).map((run) => ({ searchId: row.id, criteria: row.criteria, run }))
        : [],
    );
    setAttempt(row?.latest ?? null);
    setError("");
    setNotice(
      row?.criteriaMigrationNotice ??
        (row?.criteria.catalog?.provider === "fipe"
          ? "Busca antiga preservada como texto. Os agrupamentos FIPE anteriores não comprovam identidade de modelo; selecione novamente no catálogo quando disponível."
          : ""),
    );
  }
  useEffect(() => {
    let cancelled = false;
    readSearches()
      .then((data) => {
        if (cancelled) return;
        setSaved(data.searches);
        setIntegrations(data.integrations);
        const row = data.searches.find((item) => item.id === initialSearchId);
        if (row) loadSaved(row);
        else if (initialSearchId) setError("Busca salva não encontrada.");
        else {
          const configured = data.integrations
            .filter((item) => item.configured)
            .map((item) => item.source);
          if (configured.length)
            setDraft((current) => ({ ...current, sources: configured }));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSearchId]);
  const active = saved.find((item) => item.id === selected);
  const run = display?.run;
  const sourceRun = attempt ?? run;
  const previousShown = !!display && !!attempt && display.run.id !== attempt.id;
  const previousSources = historical.flatMap((previous) =>
    previous.run.sources
      .filter(
        (source) =>
          source.status === "ok" &&
          (sourceRun?.interrupted ||
            sourceRun?.sources.some(
              (latest) =>
                latest.source === source.source && latest.status !== "ok",
            )) &&
          !(
            display?.searchId === previous.searchId &&
            display.run.sources.some(
              (shown) =>
                shown.source === source.source && shown.status === "ok",
            )
          ),
      )
      .map((source) => ({ previous, source })),
  );
  const currentRows = useMemo(
    () =>
      run?.sources
        .filter((source) => source.status === "ok")
        .flatMap((source) => source.listings) ?? [],
    [run],
  );
  const versionFacets = useMemo(
    () => resultVersionFacets(currentRows),
    [currentRows],
  );
  const selectedVersion =
    versionFilter?.runId === run?.id ? (versionFilter?.value ?? "") : "";
  const visibleRows = useMemo(
    () =>
      currentRows.filter((row) => matchesResultVersion(row, selectedVersion)),
    [currentRows, selectedVersion],
  );
  const resultRows = visibleRows.filter(
    (row) =>
      display && listingMatchStatus(row, display.criteria) === "confirmed",
  );
  const unclassifiedRows = visibleRows.filter(
    (row) =>
      display && listingMatchStatus(row, display.criteria) === "uncertain",
  );
  const incompatibleRows = visibleRows.filter(
    (row) =>
      display && listingMatchStatus(row, display.criteria) === "incompatible",
  );
  const hasValidComparison = resultRows.some(
    (row) => row.comparison?.status === "valid",
  );
  const effectiveSort =
    sort === "discount" && !hasValidComparison ? "recent" : sort;
  const candidates = sortListings(resultRows, effectiveSort);
  const comparableDraft = (value: Draft) => [
    value.brand,
    value.model,
    value.city,
    value.state,
    [...value.cities].sort(),
    value.yearMin,
    value.yearMax,
    value.priceMax,
    value.mileageMax,
    value.privateOnly,
    [...value.sources].sort(),
  ];
  const displayedCatalog =
    display?.criteria.catalog?.provider === "carrouter"
      ? display.criteria.catalog
      : undefined;
  const draftChanged =
    !!display &&
    (JSON.stringify(comparableDraft(draft)) !==
      JSON.stringify(comparableDraft(draftFrom(display.criteria))) ||
      JSON.stringify([brandChoice?.code, modelChoice?.code]) !==
        JSON.stringify([
          displayedCatalog?.brandCode,
          displayedCatalog?.modelCode,
        ]));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    setNotice("");
    if ((!brandChoice && !manualBrand) || (!modelChoice && !manualModel)) {
      setError(
        "Selecione marca e modelo nas opções ou confirme Usar texto digitado no campo correspondente.",
      );
      return;
    }
    if (
      [draft.yearMin, draft.yearMax].some(
        (value) => value !== "" && !/^\d{4}$/.test(value),
      )
    ) {
      setError(
        "Informe os anos com quatro dígitos ou deixe o limite em branco.",
      );
      return;
    }
    if (city.trim()) {
      setError(
        "Selecione a cidade nas opções ou limpe o texto para pesquisar as cidades já selecionadas ou todo o estado.",
      );
      return;
    }
    const optional = (value: string) => (value === "" ? null : Number(value));
    const queryBrand = brandChoice?.searchName ?? brand;
    const queryModel = modelChoice?.searchName ?? model;
    const parsed = searchSchema.safeParse({
      ...draft,
      version: "",
      doors: undefined,
      locationMode,
      name: `${queryBrand} ${queryModel} · ${locationMode === "state" ? state : cities.join(", ")}`.slice(
        0,
        100,
      ),
      brand: queryBrand,
      model: queryModel,
      city: locationMode === "cities" ? (cities[0] ?? "") : "",
      cities: locationMode === "cities" ? cities : [],
      catalog: brandChoice
        ? {
            provider: "carrouter",
            revision: brandChoice.revision,
            brandCode: brandChoice.code,
            brandName: brandChoice.name,
            modelCode: modelChoice?.code,
            modelName: modelChoice?.name,
          }
        : undefined,
      yearMin: optional(draft.yearMin),
      yearMax: optional(draft.yearMax),
      mileageMax: optional(draft.mileageMax),
      priceMax: optional(draft.priceMax),
      olxUrl: "",
    });
    if (!parsed.success) {
      setError(
        "Revise os critérios: " +
          parsed.error.issues.map((issue) => issue.message).join(" "),
      );
      return;
    }
    const saveOnly =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "save";
    if (
      !saveOnly &&
      !parsed.data.sources.some((source) =>
        integrations.some((item) => item.source === source && item.configured),
      )
    ) {
      setError(
        "Nenhuma fonte selecionada está configurada. Salve os critérios sem consultar ou conecte uma fonte em Configurações.",
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Não foi possível salvar os critérios.",
        );
      let currentRun: Run | null = null;
      if (saveOnly) {
        setSelected(result.id);
        setNotice(
          "Critérios salvos. Nenhuma consulta realizada." +
            (display
              ? " Os resultados abaixo pertencem à consulta indicada."
              : ""),
        );
      } else {
        const execution = await fetch(`/api/searches/${result.id}/run`, {
          method: "POST",
        });
        const resultRun = await execution.json();
        if (!execution.ok)
          throw new Error(
            resultRun.error || "Não foi possível concluir a consulta.",
          );
        currentRun = resultRun;
        setAttempt(currentRun);
        if (hasSuccess(currentRun)) {
          setHistorical((previous) =>
            currentRun!.sources.some((source) => source.status !== "ok")
              ? display
                ? [display, ...previous]
                : previous
              : [],
          );
          setDisplay({
            searchId: result.id,
            criteria: parsed.data,
            run: currentRun!,
          });
          setSelected(result.id);
          setNotice(
            resultRun.cached
              ? "Consulta recente reutilizada, sem novo consumo de créditos."
              : "Consulta encerrada. Confira o estado de cada fonte abaixo.",
          );
        } else
          setError(
            "Nenhuma fonte concluiu a consulta. Seus filtros e resultados anteriores foram preservados.",
          );
      }
      try {
        const data = await readSearches();
        setSaved(data.searches);
        setIntegrations(data.integrations);
        const row = data.searches.find((item) => item.id === result.id);
        if (currentRun && row?.latest) {
          setAttempt(row.latest);
          if (hasSuccess(currentRun))
            setDisplay({
              searchId: row.id,
              criteria: row.criteria,
              run: row.latest,
            });
          setHistorical(
            (
              row.previousSourceRuns ??
              (row.lastSuccessful ? [row.lastSuccessful] : [])
            ).map((run) => ({ searchId: row.id, criteria: row.criteria, run })),
          );
        }
      } catch {
        setNotice(
          "Critérios salvos, mas a lista de buscas não pôde ser atualizada. Seus filtros e resultados continuam aqui.",
        );
      }
    } catch (e) {
      setError(
        (e instanceof Error
          ? e.message
          : "Não foi possível concluir a busca.") +
          " Seus filtros e resultados anteriores foram preservados.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="focus-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CARRO CERTO. PREÇO EM PERSPECTIVA.</div>
          <h1>Buscar carros</h1>
          <p className="muted">
            Encontre anúncios reais e veja quais custam menos que os
            semelhantes.
          </p>
        </div>
        <Link className="button" href="/radares">
          <Radio size={16} /> Meus radares
        </Link>
      </div>
      <div className="source-strip" aria-label="Estado das fontes">
        {integrations.map((i) => (
          <span key={i.source}>
            <strong>{sourceNames[i.source]}</strong> ·{" "}
            {!i.configured
              ? (i.configurationMessage ?? "Configuração pendente")
              : i.lastSuccessfulAt
                ? "Última consulta: " + observedWhen(i.lastSuccessfulAt)
                : "Configurada; consulta ainda não verificada"}
          </span>
        ))}
        <Link href="/configuracoes">Fontes e limites</Link>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
          {run &&
            " Os resultados anteriores permanecem identificados pela data da consulta."}
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
            <SlidersHorizontal size={17} /> O que você procura?
          </h2>
          <form onSubmit={submit} className="discovery-form">
            <fieldset className="search-fields" disabled={busy}>
              <legend className="sr-only">Critérios da busca</legend>
              <div className="form-grid two">
                <SearchCombobox
                  label="Marca"
                  name="brand"
                  required
                  maxLength={80}
                  placeholder="Toyota"
                  value={brand}
                  {...brandCatalog}
                  selectedCode={brandChoice?.code}
                  onChange={(value) => {
                    change("brand", value);
                    change("model", "");
                    setBrandChoice(null);
                    setModelChoice(null);
                    setManualBrand(false);
                    setManualModel(false);
                  }}
                  onSelect={(option) => {
                    change("brand", option.searchName ?? option.name);
                    change("model", "");
                    setBrandChoice(option);
                    setModelChoice(null);
                    setManualBrand(false);
                    setManualModel(false);
                  }}
                  onManual={() => {
                    setManualBrand(true);
                    setBrandChoice(null);
                  }}
                />
                <SearchCombobox
                  label="Modelo"
                  name="model"
                  required
                  maxLength={200}
                  placeholder={
                    brandChoice || manualBrand
                      ? "Buscar modelo"
                      : "Escolha marca"
                  }
                  value={model}
                  {...modelCatalog}
                  selectedCode={modelChoice?.code}
                  disabled={!brandChoice && !manualBrand}
                  onChange={(value) => {
                    change("model", value);
                    setModelChoice(null);
                    setManualModel(false);
                  }}
                  onSelect={(option) => {
                    change("model", option.searchName ?? option.name);
                    setModelChoice(option);
                    setManualModel(false);
                  }}
                  onManual={() => {
                    setManualModel(true);
                    setModelChoice(null);
                  }}
                />
              </div>
              <p className="discovery-help muted">
                {manualBrand || manualModel
                  ? "Entrada manual confirmada, temporária enquanto o catálogo é definido. Use o modelo sem versão; a correspondência depende dos atributos informados pela fonte."
                  : brandCatalog.error
                    ? "Catálogo estruturado indisponível. A entrada manual é temporária enquanto a fonte é definida."
                    : "Marca e modelo usam relações do catálogo importado. Trocar opções não consulta anúncios."}
              </p>
              <div className="form-grid two vehicle-year-row">
                <label>
                  Ano-modelo de
                  <input
                    name="yearMin"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Sem mínimo"
                    value={draft.yearMin}
                    onChange={(event) => change("yearMin", event.target.value)}
                  />
                </label>
                <label>
                  Ano-modelo até
                  <input
                    name="yearMax"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Sem máximo"
                    value={draft.yearMax}
                    onChange={(event) => change("yearMax", event.target.value)}
                  />
                </label>
              </div>
              <fieldset className="location-scope">
                <legend>Localização</legend>
                <div className="form-grid two location-row">
                  <label>
                    Estado
                    <select
                      name="state"
                      value={state}
                      onChange={(event) => {
                        change("state", event.target.value);
                        change("city", "");
                        change("cities", []);
                      }}
                    >
                      {states.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <SearchCombobox
                    label="Adicionar cidade"
                    name="city"
                    maxLength={120}
                    placeholder={`Cidade em ${state} (opcional)`}
                    value={city}
                    {...cityCatalog}
                    onChange={(value) => change("city", value)}
                    onSelect={(option) => {
                      if (
                        !cities.some(
                          (item) =>
                            item.localeCompare(option.name, "pt-BR", {
                              sensitivity: "base",
                            }) === 0,
                        )
                      )
                        change("cities", [...cities, option.name]);
                      change("city", "");
                    }}
                  />
                </div>
                {
                  <div className="city-chips" aria-label="Cidades selecionadas">
                    {cities.map((item) => (
                      <button
                        key={item}
                        type="button"
                        aria-label={`Remover ${item}`}
                        onClick={() =>
                          change(
                            "cities",
                            cities.filter((cityName) => cityName !== item),
                          )
                        }
                      >
                        {item} <span aria-hidden="true">×</span>
                      </button>
                    ))}
                    {!cities.length && (
                      <small>
                        Nenhuma cidade selecionada: todo o estado de {state}.
                      </small>
                    )}
                  </div>
                }
              </fieldset>
              <details
                className="advanced-filters"
                open={advancedOpen}
                onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
              >
                <summary>Mais filtros</summary>
                <label>
                  Quilometragem máxima
                  <input
                    name="mileageMax"
                    type="number"
                    min="0"
                    max="10000000"
                    placeholder="Sem limite"
                    value={draft.mileageMax}
                    onChange={(event) =>
                      change("mileageMax", event.target.value)
                    }
                  />
                </label>
                <label>
                  Orçamento máximo (R$)
                  <input
                    name="priceMax"
                    type="number"
                    min="1"
                    max="10000000"
                    placeholder="Opcional"
                    value={draft.priceMax}
                    onChange={(event) => change("priceMax", event.target.value)}
                  />
                </label>
                <p className="discovery-help muted">
                  O orçamento filtra a consulta. A referência também pode usar
                  anúncios mais caros já observados, sem ampliar esta busca.
                </p>
                <label className="discovery-check">
                  <input
                    type="checkbox"
                    name="privateOnly"
                    checked={draft.privateOnly}
                    onChange={(event) =>
                      change("privateOnly", event.target.checked)
                    }
                  />{" "}
                  Somente particulares confirmados
                </label>
              </details>
              <fieldset>
                <legend>Consultar em</legend>
                {(["olx", "webmotors"] as Source[]).map((source) => (
                  <label className="discovery-check" key={source}>
                    <input
                      name="sources"
                      value={source}
                      type="checkbox"
                      checked={draft.sources.includes(source)}
                      onChange={(event) =>
                        change(
                          "sources",
                          event.target.checked
                            ? [...draft.sources, source]
                            : draft.sources.filter((item) => item !== source),
                        )
                      }
                    />
                    {sourceNames[source]}
                    {!integrations.find((item) => item.source === source)
                      ?.configured
                      ? " · configuração pendente"
                      : ""}
                  </label>
                ))}
              </fieldset>
              <p className="discovery-help muted">
                Fontes sem conexão podem ser salvas nos critérios para consultar
                depois de configuradas.
              </p>
            </fieldset>
            <div className="discovery-actions">
              <button
                className="button primary"
                type="submit"
                disabled={busy || loading}
              >
                <Search size={17} />
                {busy ? "Consultando fontes…" : "Buscar agora"}
              </button>
              <button
                className="text-button"
                type="submit"
                value="save"
                disabled={busy || loading}
              >
                Salvar critérios sem consultar
              </button>
            </div>
            <details className="search-costs">
              <summary>Consumo desta busca</summary>
              <p>
                OLX: 1 crédito Gecko por chamada; Webmotors: 2 créditos Reef por
                chamada. Mais de um modelo na fonte ou mais de uma página pode
                exigir chamadas adicionais. Cidades selecionadas são consultadas
                separadamente; uma cidade nova na OLX pode exigir 1 crédito Reef
                para resolver a localização. Os limites são verificados antes de
                cada chamada. Filtrar a versão dos resultados recebidos não
                consome créditos.
              </p>
              {integrations.map((i) => (
                <p key={i.source}>
                  {sourceNames[i.source]}: {i.reservedToday}/{i.dailyLimit}{" "}
                  créditos reservados hoje.
                </p>
              ))}
            </details>
          </form>
        </section>
        <section
          className="discovery-results"
          aria-busy={busy}
          aria-label="Resultados da busca"
        >
          <div className="results-controls">
            <label>
              Retomar uma busca
              <select
                disabled={busy}
                value={selected}
                onChange={(e) => {
                  loadSaved(saved.find((row) => row.id === e.target.value));
                }}
              >
                <option value="">Nova busca</option>
                {saved.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.criteria.name}
                  </option>
                ))}
              </select>
            </label>
            {(display || active) && (
              <Link
                className="button"
                href={`/radares?busca=${encodeURIComponent(display?.searchId ?? active!.id)}`}
              >
                <Radio size={16} /> Criar alerta desta busca
              </Link>
            )}
          </div>
          {busy && (
            <div className="empty-state" role="status">
              <Search size={26} />
              <h2>Consultando os anúncios</h2>
              <p>
                A consulta pode levar alguns instantes. Os cliques repetidos são
                bloqueados.
              </p>
            </div>
          )}
          {draftChanged && (
            <p className="discovery-warning" role="status">
              Os filtros foram alterados. Os resultados ainda são da consulta
              anterior; clique em Buscar agora para atualizá-los.
            </p>
          )}
          {sourceRun?.interrupted && (
            <p className="error-box" role="alert">
              Consulta interrompida. Nenhum resultado completo foi confirmado.
            </p>
          )}
          <div className="source-results">
            {sourceRun?.sources.map((s) => (
              <details
                key={s.source}
                open={
                  s.status !== "ok" ||
                  s.applied?.mapping?.status === "uncertain"
                }
              >
                <summary>
                  {sourceNames[s.source]} ·{" "}
                  {s.status === "ok"
                    ? s.partial
                      ? "Cobertura parcial"
                      : "Consultada"
                    : s.status === "unconfigured"
                      ? "Não conectada"
                      : "Falhou"}
                  {s.status === "ok"
                    ? ` · ${s.listings.filter((r) => !r.reasons.length).length} candidatos`
                    : ""}
                  {s.applied?.mapping?.status === "uncertain" &&
                    " · Correspondência com a fonte incerta"}
                </summary>
                <p>{s.message}</p>
                {s.applied && (
                  <>
                    <p>
                      Enviado à fonte: {s.applied.remote.join(", ")}.
                      Conferência local dos critérios preenchidos:{" "}
                      {s.applied.local.join(", ")}.
                    </p>
                    {s.applied.mapping && <p>{s.applied.mapping.message}</p>}
                  </>
                )}
                <small>
                  {observedWhen(s.observedAt)} ·{" "}
                  {s.received ?? s.listings.length} recebidos ·{" "}
                  {s.listings.filter((row) => !row.reasons.length).length}{" "}
                  aprovados ·{" "}
                  {
                    s.listings.filter(
                      (row) =>
                        display &&
                        listingMatchStatus(row, display.criteria) ===
                          "uncertain",
                    ).length
                  }{" "}
                  incertos ·{" "}
                  {
                    s.listings.filter(
                      (row) =>
                        display &&
                        listingMatchStatus(row, display.criteria) ===
                          "incompatible",
                    ).length
                  }{" "}
                  incompatíveis ·{" "}
                  {(s.received ?? s.listings.length) - s.listings.length}{" "}
                  descartados na normalização.
                </small>
                <ul aria-label="Descartes por motivo">
                  {Object.entries(
                    s.listings.reduce<Record<string, number>>(
                      (counts, row) => {
                        for (const reason of row.reasons)
                          counts[reason] = (counts[reason] ?? 0) + 1;
                        return counts;
                      },
                      { ...s.normalizationDiscards },
                    ),
                  ).map(([reason, count]) => (
                    <li key={reason}>
                      {reason}: {count}
                    </li>
                  ))}
                </ul>
                <small>
                  As classificações são separadas; um anúncio pode ter mais de
                  uma restrição.
                </small>
              </details>
            ))}
          </div>
          {loading ? (
            <p role="status">Carregando buscas…</p>
          ) : !run ? (
            <div className="empty-state">
              <Search size={28} />
              <h2>
                {attempt
                  ? "Busca indisponível"
                  : active
                    ? "Critérios prontos para consultar"
                    : "Comece pelo carro que procura"}
              </h2>
              <p>
                {attempt
                  ? "Nenhuma fonte concluiu a consulta. Confira a configuração e tente novamente."
                  : "Preencha os filtros e clique em Buscar agora. A comparação aparece aqui, sem cadastrar cada anúncio."}
              </p>
            </div>
          ) : (
            <>
              <p className="muted">
                Critérios aplicados: {display?.criteria.brand}{" "}
                {display?.criteria.model} · versão refinada nos resultados ·{" "}
                {display ? criteriaLocation(display.criteria) : ""} · ano de{" "}
                {display?.criteria.yearMin ?? "qualquer"} até{" "}
                {display?.criteria.yearMax ?? "qualquer"} · preço máximo{" "}
                {display?.criteria.priceMax ?? "sem limite"} · km máximo{" "}
                {display?.criteria.mileageMax ?? "sem limite"} ·{" "}
                {display?.criteria.privateOnly
                  ? "somente particulares"
                  : "todos os vendedores"}{" "}
                · fontes{" "}
                {display?.criteria.sources
                  .map((source) => sourceNames[source])
                  .join(", ")}
                . Consulta de {observedWhen(run.createdAt)}. A referência é
                recalculada com as observações disponíveis dos últimos 7 dias.
              </p>
              {previousShown && (
                <p className="discovery-warning" role="status">
                  A última tentativa falhou. Exibindo os resultados anteriores
                  de {observedWhen(run.createdAt)}.
                </p>
              )}
              <div className="results-controls">
                <label>
                  Versão nos resultados
                  <select
                    name="resultVersion"
                    value={selectedVersion}
                    onChange={(event) =>
                      setVersionFilter({
                        runId: run.id,
                        value: event.target.value,
                      })
                    }
                  >
                    <option value="">
                      Todas as versões (
                      {versionFacets.reduce(
                        (sum, option) => sum + option.count,
                        0,
                      )}
                      )
                    </option>
                    {versionFacets.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} ({option.count})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="discovery-help muted">
                Filtra somente os anúncios recebidos nesta consulta, sem nova
                coleta ou consumo de créditos.
                {run.sources.some(
                  (source) => source.status === "ok" && source.partial,
                ) &&
                  " Há páginas ou resultados ainda não coletados; uma versão ausente aqui pode existir na fonte."}
              </p>
              <div className="results-controls">
                <h2>
                  {candidates.length}{" "}
                  {candidates.length === 1 ? "candidato" : "candidatos"}
                </h2>
                <label>
                  Ordenar por
                  <select
                    value={effectiveSort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}
                  >
                    {hasValidComparison && (
                      <option value="discount">
                        Maior percentual abaixo da média
                      </option>
                    )}
                    <option value="price">Menor preço</option>
                    <option value="recent">Observados mais recentemente</option>
                  </select>
                </label>
              </div>
              {!candidates.length && (
                <div className="empty-state">
                  <h2>
                    {selectedVersion
                      ? "Nenhum candidato confirmado nesta versão"
                      : run.sources.some((s) => s.status === "ok")
                        ? "Nenhuma correspondência confirmada neste recorte"
                        : "Busca indisponível"}
                  </h2>
                  <p>
                    {selectedVersion
                      ? "Confira os resultados incertos ou incompatíveis abaixo, ou selecione Todas as versões para rever a coleta completa."
                      : run.sources.some((s) => s.status === "ok")
                        ? unclassifiedRows.length
                          ? "Há anúncios com correspondência incerta para revisar abaixo. A falta de confirmação do catálogo não significa que o veículo não exista. Todos os filtros continuam sendo conferidos."
                          : "Nenhum anúncio recebido teve todos os critérios confirmados. A cobertura da coleta pode limitar os resultados; isso não comprova ausência no mercado."
                        : "Nenhuma fonte concluiu a consulta. Confira a configuração e as falhas acima."}
                  </p>
                </div>
              )}
              {candidates.map((row) => (
                <ListingCard
                  key={`${row.source}:${row.externalId}`}
                  listing={row}
                  searchId={display?.searchId}
                  matchStatus="confirmed"
                />
              ))}
              {candidates.length > 0 && (
                <p className="muted">
                  Abaixo da média descreve preços anunciados da amostra
                  observada. Confira condição e disponibilidade no anúncio
                  original.
                </p>
              )}
              {unclassifiedRows.length > 0 && (
                <details className="previous-results">
                  <summary>
                    {unclassifiedRows.length} resultado
                    {unclassifiedRows.length === 1 ? "" : "s"} com
                    correspondência incerta
                  </summary>
                  <p>
                    Estes anúncios continuam visíveis para revisão, mas não
                    entram na contagem de correspondências exatas.
                  </p>
                  {unclassifiedRows.map((row) => (
                    <ListingCard
                      key={`unclassified:${row.source}:${row.externalId}`}
                      listing={row}
                      searchId={display?.searchId}
                      matchStatus="uncertain"
                    />
                  ))}
                </details>
              )}
              {incompatibleRows.length > 0 && (
                <details className="previous-results">
                  <summary>
                    {incompatibleRows.length} resultado
                    {incompatibleRows.length === 1
                      ? " incompatível"
                      : "s incompatíveis"}{" "}
                    com os filtros
                  </summary>
                  <p>
                    Há pelo menos um dado confirmado fora dos critérios
                    selecionados. Estes anúncios não entram na contagem de
                    candidatos.
                  </p>
                  {incompatibleRows.map((row) => (
                    <ListingCard
                      key={`incompatible:${row.source}:${row.externalId}`}
                      listing={row}
                      searchId={display?.searchId}
                      matchStatus="incompatible"
                    />
                  ))}
                </details>
              )}
            </>
          )}
          {previousSources.map(({ previous, source }) => (
            <details
              className="previous-results"
              key={`${previous.run.id}:${source.source}`}
            >
              <summary>
                Resultados anteriores de {sourceNames[source.source]} ·{" "}
                {observedWhen(source.observedAt)}
              </summary>
              <p>
                Consulta anterior de {previous.criteria.brand}{" "}
                {previous.criteria.model}, em{" "}
                {criteriaLocation(previous.criteria)}. A fonte falhou agora;
                estes anúncios não entram na contagem atual.
              </p>
              {source.listings
                .filter((row) => !row.reasons.length)
                .map((row) => (
                  <ListingCard
                    key={`${row.source}:${row.externalId}`}
                    listing={row}
                    searchId={previous.searchId}
                  />
                ))}
            </details>
          ))}
        </section>
      </div>
    </div>
  );
}
