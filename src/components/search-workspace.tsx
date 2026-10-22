"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Radio } from "lucide-react";
import {
  searchSchema,
  criteriaLocation,
  canonicalBrand,
  sourceNames,
  type SearchCriteria,
  type SearchResult,
  type Source,
} from "@/lib/discovery";
import { sortListings } from "@/lib/listing-comparison";
import { states } from "@/lib/vehicle";
import { ListingCard, observedWhen } from "./listing-card";
import { SearchCombobox, type SearchOption } from "./search-combobox";
import { useWorkspace } from "./workspace";
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
  version: string;
  city: string;
  cities: string[];
  locationMode: "cities" | "state";
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
  version: "",
  city: "",
  cities: [],
  locationMode: "cities",
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
  cities: criteria.cities?.length
    ? criteria.cities
    : criteria.city
      ? [criteria.city]
      : [],
  version: criteria.version ?? "",
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
        if (!Array.isArray(options) || !options.length) throw new Error();
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
  const [loadedCriteria, setLoadedCriteria] = useState<SearchCriteria | null>(
    null,
  );
  const [brandChoice, setBrandChoice] = useState<SearchOption | null>(null);
  const [modelChoice, setModelChoice] = useState<SearchOption | null>(null);
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
  const { vehicles } = useWorkspace();
  const { brand, model, version, city, cities, locationMode, state } = draft;
  const brandCatalog = useCatalog("/api/search-options?type=brands");
  // Only a committed catalog choice requests models; typing never does.
  const modelCatalog = useCatalog(
    brandChoice
      ? `/api/search-options?type=models&brand=${encodeURIComponent(brandChoice.code)}`
      : null,
  );
  const resolvedModelChoice = (
    modelChoice as (SearchOption & { versions?: SearchOption[] }) | null
  )?.versions?.length
    ? (modelChoice as SearchOption & { versions?: SearchOption[] })
    : (modelCatalog.options.find(
        (option) => option.code === modelChoice?.code,
      ) as (SearchOption & { versions?: SearchOption[] }) | undefined);
  const catalogVersions = resolvedModelChoice?.versions ?? [];
  const yearCatalog = useCatalog(
    brandChoice && catalogVersions.length
      ? `/api/search-options?type=years&brand=${encodeURIComponent(brandChoice.code)}&models=${encodeURIComponent(catalogVersions.map((item) => item.code).join(","))}`
      : null,
  );
  const fallbackYears = useMemo(
    () =>
      Array.from({ length: new Date().getFullYear() - 1898 }, (_, index) => {
        const year = String(new Date().getFullYear() + 1 - index);
        return { code: year, name: year };
      }),
    [],
  );
  const selectedYears = yearCatalog.options.filter((option) => {
    const year = Number(option.code);
    const min = draft.yearMin ? Number(draft.yearMin) : null;
    const max = draft.yearMax ? Number(draft.yearMax) : min;
    return min !== null && year >= min && year <= (max ?? min);
  });
  const compatibleVersions = [
    ...new Map(
      selectedYears
        .flatMap(
          (year) =>
            (year as SearchOption & { versions?: SearchOption[] }).versions ??
            [],
        )
        .map((item) => [item.code, item]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const versionLabel = (item: SearchOption) => {
    const family = modelChoice?.name.trim() ?? "";
    const rest = item.name.slice(family.length).trim();
    return family &&
      item.name
        .toLocaleLowerCase("pt-BR")
        .startsWith(family.toLocaleLowerCase("pt-BR")) &&
      rest
      ? rest
      : item.name;
  };
  const selectedVersion = compatibleVersions.find(
    (item) => versionLabel(item) === version,
  );
  const cityCatalog = useCatalog(
    `/api/search-options?type=cities&state=${encodeURIComponent(state)}`,
  );
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function loadSaved(row?: Saved) {
    setSelected(row?.id ?? "");
    setLoadedCriteria(row?.criteria ?? null);
    setDraft(row ? draftFrom(row.criteria) : emptyDraft());
    const catalog = row?.criteria.catalog;
    setBrandChoice(
      catalog
        ? {
            code: catalog.brandCode,
            name: catalog.brandName,
            searchName: row!.criteria.brand,
          }
        : null,
    );
    setModelChoice(
      catalog?.modelGroup
        ? {
            code: catalog.modelGroup,
            name: row!.criteria.model,
            searchName: row!.criteria.model,
          }
        : null,
    );
    setManualBrand(!!row && !catalog);
    setManualModel(!!row && !catalog?.modelGroup);
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
    setNotice("");
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
  const suggestions = useMemo(() => {
    const rows = [
      ...vehicles,
      ...saved.map((item) => item.criteria),
      ...saved.flatMap(
        (item) =>
          item.latest?.sources.flatMap((source) => source.listings) ?? [],
      ),
    ];
    return [
      ...new Set(
        rows
          .filter(
            (row) =>
              canonicalBrand(row.brand ?? "") === canonicalBrand(brand) &&
              row.model?.toLocaleLowerCase("pt-BR") ===
                model.toLocaleLowerCase("pt-BR"),
          )
          .map((row) => row.version)
          .filter((value): value is string => !!value?.trim()),
      ),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [brand, model, saved, vehicles]);
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
  const resultRows =
    run?.sources
      .filter((source) => source.status === "ok")
      .flatMap((source) => source.listings)
      .filter((row) => !row.reasons.length) ?? [];
  const hasValidComparison = resultRows.some(
    (row) => row.comparison?.status === "valid",
  );
  const effectiveSort =
    sort === "discount" && !hasValidComparison ? "recent" : sort;
  const candidates = sortListings(resultRows, effectiveSort);
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
    const optional = (value: string) => (value === "" ? null : Number(value));
    const queryBrand = brandChoice?.searchName ?? brand;
    const queryModel = modelChoice?.searchName ?? model;
    const loadedCities = loadedCriteria
      ? loadedCriteria.cities.length
        ? loadedCriteria.cities
        : loadedCriteria.city
          ? [loadedCriteria.city]
          : []
      : [];
    const sameLegacyQuery =
      loadedCriteria &&
      queryBrand === loadedCriteria.brand &&
      queryModel === loadedCriteria.model &&
      locationMode === loadedCriteria.locationMode &&
      JSON.stringify(cities) === JSON.stringify(loadedCities) &&
      state === loadedCriteria.state &&
      optional(draft.yearMin) === loadedCriteria.yearMin &&
      optional(draft.yearMax) === loadedCriteria.yearMax;
    const parsed = searchSchema.safeParse({
      ...draft,
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
            provider: "fipe",
            brandCode: brandChoice.code,
            brandName: brandChoice.name,
            modelGroup: modelChoice?.code.startsWith("family:")
              ? modelChoice.code
              : undefined,
            modelCode: selectedVersion?.code,
            modelName: selectedVersion?.name,
          }
        : undefined,
      yearMin: optional(draft.yearMin),
      yearMax: optional(draft.yearMax),
      mileageMax: optional(draft.mileageMax),
      priceMax: optional(draft.priceMax),
      olxUrl: sameLegacyQuery ? loadedCriteria.olxUrl : "",
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
                    change("version", "");
                    change("yearMin", "");
                    change("yearMax", "");
                    setBrandChoice(null);
                    setModelChoice(null);
                    setManualBrand(false);
                    setManualModel(false);
                  }}
                  onSelect={(option) => {
                    change("brand", option.searchName ?? option.name);
                    change("model", "");
                    change("version", "");
                    change("yearMin", "");
                    change("yearMax", "");
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
                    change("version", "");
                    change("yearMin", "");
                    change("yearMax", "");
                    setModelChoice(null);
                    setManualModel(false);
                  }}
                  onSelect={(option) => {
                    change("model", option.searchName ?? option.name);
                    change("version", "");
                    change("yearMin", "");
                    change("yearMax", "");
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
                  ? "Entrada manual confirmada. Use o modelo sem versão; a correspondência depende dos atributos informados pela fonte."
                  : "Modelos agrupados a partir das descrições FIPE. A consulta usa o nome do modelo, sem exigir a descrição completa da versão."}
              </p>
              <div className="form-grid two vehicle-year-row">
                <label>
                  Ano-modelo de
                  <select
                    name="yearMin"
                    value={draft.yearMin}
                    disabled={!!modelChoice && yearCatalog.loading}
                    onChange={(event) => {
                      change("yearMin", event.target.value);
                      if (
                        !draft.yearMax ||
                        Number(draft.yearMax) < Number(event.target.value)
                      )
                        change("yearMax", event.target.value);
                      change("version", "");
                    }}
                  >
                    <option value="">Qualquer ano</option>
                    {(modelChoice ? yearCatalog.options : fallbackYears).map(
                      (x) => (
                        <option key={x.code} value={x.code}>
                          {x.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Ano-modelo até
                  <select
                    name="yearMax"
                    value={draft.yearMax}
                    disabled={!draft.yearMin}
                    onChange={(event) => {
                      change("yearMax", event.target.value);
                      change("version", "");
                    }}
                  >
                    <option value="">Mesmo ano</option>
                    {(modelChoice ? yearCatalog.options : fallbackYears)
                      .filter((x) => Number(x.code) >= Number(draft.yearMin))
                      .map((x) => (
                        <option key={x.code} value={x.code}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {yearCatalog.error && (
                <p className="field-error">
                  Não foi possível carregar os anos disponíveis.
                </p>
              )}
              <label>
                Versão <small>Opcional · depende do modelo e do ano</small>
                {modelChoice && draft.yearMin ? (
                  <select
                    name="version"
                    value={version}
                    onChange={(event) => change("version", event.target.value)}
                  >
                    <option value="">Todas as versões compatíveis</option>
                    {compatibleVersions.map((item) => (
                      <option key={item.code} value={versionLabel(item)}>
                        {versionLabel(item)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name="version"
                    list="known-versions"
                    maxLength={120}
                    placeholder={
                      modelChoice ? "Escolha primeiro o ano" : "Ex.: XEi"
                    }
                    value={version}
                    autoComplete="off"
                    disabled={!!modelChoice}
                    onChange={(event) => change("version", event.target.value)}
                  />
                )}
                <datalist id="known-versions">
                  {suggestions.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </label>
              <fieldset className="location-scope">
                <legend>Abrangência</legend>
                <div className="scope-options">
                  <label className="discovery-check">
                    <input
                      type="radio"
                      name="locationMode"
                      checked={locationMode === "cities"}
                      onChange={() => change("locationMode", "cities")}
                    />
                    Cidades selecionadas
                  </label>
                  <label className="discovery-check">
                    <input
                      type="radio"
                      name="locationMode"
                      checked={locationMode === "state"}
                      onChange={() => {
                        change("locationMode", "state");
                        change("city", "");
                      }}
                    />
                    Estado inteiro
                  </label>
                </div>
                <div className="form-grid two location-row">
                  <label>
                    UF
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
                    placeholder={
                      locationMode === "state"
                        ? `Todo o estado de ${state}`
                        : `Cidade em ${state}`
                    }
                    value={city}
                    {...cityCatalog}
                    disabled={locationMode === "state"}
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
                {locationMode === "cities" && (
                  <div className="city-chips" aria-label="Cidades selecionadas">
                    {cities.map((item) => (
                      <button
                        key={item}
                        type="button"
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
                      <small>Selecione ao menos uma cidade.</small>
                    )}
                  </div>
                )}
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
                  O orçamento filtra os resultados. Os semelhantes mais caros
                  continuam na referência.
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
                {locationMode === "cities" && cities.length > 1
                  ? `${cities.length} consultas por fonte, uma para cada cidade. `
                  : "Uma consulta por fonte. "}
                OLX: 1 crédito Gecko por consulta; Webmotors: 2 créditos Reef
                por consulta. Uma cidade nova na OLX pode exigir 1 crédito Reef
                adicional. No modo Estado inteiro é feita uma consulta estadual
                por fonte. Limites e saldo gratuito são verificados antes da
                coleta.
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
          {sourceRun?.interrupted && (
            <p className="error-box" role="alert">
              Consulta interrompida. Nenhum resultado completo foi confirmado.
            </p>
          )}
          <div className="source-results">
            {sourceRun?.sources.map((s) => (
              <details key={s.source} open={s.status !== "ok"}>
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
                </summary>
                <p>{s.message}</p>
                <small>
                  {observedWhen(s.observedAt)} · {s.listings.length} anúncios
                  recebidos para candidatos e referência.
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
                {display?.criteria.brand} {display?.criteria.model} ·{" "}
                {display ? criteriaLocation(display.criteria) : ""}. Consulta de{" "}
                {observedWhen(run.createdAt)}. A referência é recalculada com as
                observações disponíveis dos últimos 7 dias.
              </p>
              {previousShown && (
                <p className="discovery-warning" role="status">
                  A última tentativa falhou. Exibindo os resultados anteriores
                  de {observedWhen(run.createdAt)}.
                </p>
              )}
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
                    {run.sources.some((s) => s.status === "ok")
                      ? "Nenhum candidato neste recorte"
                      : "Busca indisponível"}
                  </h2>
                  <p>
                    {run.sources.some((s) => s.status === "ok")
                      ? "As fontes que responderam não trouxeram candidatos que atendam a todos os filtros. A cobertura de uma página pode limitar os resultados."
                      : "Nenhuma fonte concluiu a consulta. Confira a configuração e as falhas acima."}
                  </p>
                </div>
              )}
              {candidates.map((row) => (
                <ListingCard
                  key={`${row.source}:${row.externalId}`}
                  listing={row}
                  searchId={display?.searchId}
                />
              ))}
              {candidates.length > 0 && (
                <p className="muted">
                  Abaixo da média descreve preços anunciados da amostra
                  observada. Confira condição e disponibilidade no anúncio
                  original.
                </p>
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
