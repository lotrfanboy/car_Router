"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Radio } from "lucide-react";
import {
  searchSchema,
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
type Saved = { id: string; criteria: SearchCriteria; latest: Run | null };
type Integration = {
  source: Source;
  configured: boolean;
  configurationMessage?: string;
  cost: number;
  reservedToday: number;
  dailyLimit: number;
  lastSuccessfulAt: string | null;
};
export function SearchWorkspace({
  initialSearchId = "",
}: {
  initialSearchId?: string;
}) {
  const [saved, setSaved] = useState<Saved[]>([]),
    [integrations, setIntegrations] = useState<Integration[]>([]),
    [selected, setSelected] = useState(initialSearchId),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [sort, setSort] = useState<"discount" | "price" | "recent">("recent");
  const pending = useRef(false);
  const { vehicles } = useWorkspace();
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [version, setVersion] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("PR");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [brandOptions, setBrandOptions] = useState<SearchOption[]>([]);
  const [modelOptions, setModelOptions] = useState<SearchOption[]>([]);
  const [cityOptions, setCityOptions] = useState<SearchOption[]>([]);
  const [modelOptionsBrand, setModelOptionsBrand] = useState("");
  const [cityOptionsState, setCityOptionsState] = useState("");
  const [catalogNotice, setCatalogNotice] = useState("");
  const [brandStatus, setBrandStatus] = useState<"loading" | "ready" | "error">("loading");
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "error">("ready");
  const [cityStatus, setCityStatus] = useState<"loading" | "ready" | "error">("loading");
  const [brandRetry, setBrandRetry] = useState(0);
  const [modelRetry, setModelRetry] = useState(0);
  const [cityRetry, setCityRetry] = useState(0);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/searches", { cache: "no-store" });
    if (!res.ok) throw new Error("Não foi possível carregar suas buscas.");
    const data = await res.json();
    setSaved(data.searches);
    setIntegrations(data.integrations);
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => refresh())
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    // Fetch lifecycle intentionally updates the catalog status.
    /* eslint-disable react-hooks/set-state-in-effect */
    setBrandStatus("loading");
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch("/api/search-options?type=brands")
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<SearchOption[]>;
      })
      .then((options) => {
        if (!cancelled) { setBrandOptions(options); setBrandStatus("ready"); }
      })
      .catch(() => {
        if (!cancelled) {
          setBrandStatus("error");
          setCatalogNotice("Catálogo FIPE indisponível; digitação manual liberada.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brandRetry]);
  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setCityStatus("loading");
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(`/api/search-options?type=cities&state=${encodeURIComponent(state)}`)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<SearchOption[]>;
      })
      .then((options) => {
        if (!cancelled) { setCityOptions(options); setCityOptionsState(state); setCityStatus("ready"); }
      })
      .catch(() => {
        if (!cancelled) {
          setCityStatus("error");
          setCatalogNotice("Catálogo de municípios indisponível; digitação manual liberada.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state, cityRetry]);
  useEffect(() => {
    let cancelled = false;
    const selectedBrand = brandOptions.find(
      (option) =>
        canonicalBrand(option.name) === canonicalBrand(brand),
    );
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!selectedBrand) {
      setModelOptions([]);
      setModelOptionsBrand("");
      setModelStatus("ready");
      return;
    }
    setModelStatus("loading");
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch(
      `/api/search-options?type=models&brand=${encodeURIComponent(selectedBrand.code)}`,
    )
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<SearchOption[]>;
      })
      .then((options) => {
        if (!cancelled) { setModelOptions(options); setModelOptionsBrand(selectedBrand.code); setModelStatus("ready"); }
      })
      .catch(() => {
        if (!cancelled) {
          setModelStatus("error");
          setCatalogNotice("Modelos FIPE indisponíveis; digitação manual liberada.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brand, brandOptions, modelRetry]);
  const active = saved.find((s) => s.id === selected),
    criteria = active?.criteria,
    run = active?.latest;
  /* The selected saved search is an external record loaded from the API. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setBrand(criteria?.brand ?? "");
    setModel(criteria?.model ?? "");
    setVersion(criteria?.version ?? "");
    setCity(criteria?.city ?? "");
    setState(criteria?.state ?? "PR");
    setAdvancedOpen(
      Boolean(
        criteria?.yearMin ||
          criteria?.yearMax ||
          criteria?.mileageMax ||
          criteria?.priceMax ||
          criteria?.privateOnly,
      ),
    );
  }, [criteria]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const suggestions = useMemo(() => {
    const rows = [
      ...vehicles.map((v) => ({
        brand: v.brand,
        model: v.model,
        version: v.version,
        city: v.city,
        state: v.state,
      })),
      ...saved.map((s) => s.criteria),
      ...saved.flatMap((s) =>
        s.latest?.sources.flatMap((source) => source.listings) ?? [],
      ),
    ];
    const unique = (values: (string | null | undefined)[]) =>
      [...new Set(values.filter((x): x is string => Boolean(x?.trim())))].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      );
    const same = (a: string | null | undefined, b: string) =>
      !b || a?.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;
    return {
      versions: unique(
        rows
          .filter((r) => same(r.brand, brand) && same(r.model, model))
          .map((r) => r.version),
      ),
    };
  }, [brand, model, saved, vehicles]);
  const resultRows = run?.sources
      .filter((s) => s.status === "ok")
      .flatMap((s) => s.listings)
      .filter((row) => !row.reasons.length) ?? [];
  const hasValidComparison = resultRows.some((row) => row.comparison?.status === "valid");
  const selectedBrandCode = brandOptions.find((option) => canonicalBrand(option.name) === canonicalBrand(brand))?.code;
  const effectiveSort = sort === "discount" && !hasValidComparison ? "recent" : sort;
  const candidates = sortListings(resultRows, effectiveSort);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget),
      optional = (key: string) =>
        form.get(key) === "" ? null : Number(form.get(key));
    const parsed = searchSchema.safeParse({
      name: `${form.get("brand")} ${form.get("model")} · ${form.get("city")}`.slice(
        0,
        100,
      ),
      brand: form.get("brand"),
      model: form.get("model"),
      version: form.get("version"),
      city: form.get("city"),
      state: form.get("state"),
      yearMin: optional("yearMin"),
      yearMax: optional("yearMax"),
      mileageMax: optional("mileageMax"),
      priceMax: optional("priceMax"),
      privateOnly: form.get("privateOnly") === "on",
      sources: form.getAll("sources"),
      olxUrl: criteria?.olxUrl ?? "",
    });
    if (!parsed.success) {
      setError(
        "Revise os critérios: " +
          parsed.error.issues.map((i) => i.message).join(" "),
      );
      return;
    }
    const saveOnly =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "save";
    if (!saveOnly && !parsed.data.sources.some((source) =>
      integrations.some((integration) => integration.source === source && integration.configured),
    )) {
      setError("Nenhuma fonte selecionada está configurada. Salve os critérios sem consultar ou conecte uma fonte em Configurações.");
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
      if (!response.ok) throw new Error(result.error);
      setSelected(result.id);
      if (saveOnly) setNotice("Critérios salvos. Nenhuma consulta realizada.");
      else {
        const response = await fetch(`/api/searches/${result.id}/run`, {
          method: "POST",
        });
        const resultRun = await response.json();
        if (!response.ok) throw new Error(resultRun.error);
        setNotice(
          resultRun.cached
            ? "Consulta recente reutilizada, sem novo consumo de créditos."
            : "Consulta encerrada. Confira o estado de cada fonte abaixo.",
        );
      }
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível concluir a busca.",
      );
      await refresh().catch(() => {});
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
          <form
            key={`${selected}:${active ? "loaded" : "new"}:${integrations.map((item) => `${item.source}-${item.configured}`).join(",")}`}
            onSubmit={submit}
            className="discovery-form"
          >
            <div className="form-grid two">
              <SearchCombobox label="Marca" name="brand" required maxLength={80} placeholder="Toyota" value={brand} options={brandOptions} loading={brandStatus === "loading"} error={brandStatus === "error"} onRetry={() => setBrandRetry((n) => n + 1)} onChange={(value) => { setBrand(value); setModel(""); setVersion(""); setModelOptions([]); setModelOptionsBrand(""); setModelStatus("ready"); }} />
              <SearchCombobox label="Modelo/versão FIPE" name="model" required maxLength={200} placeholder="Digite o modelo ou selecione a descrição FIPE" value={model} options={selectedBrandCode === modelOptionsBrand ? modelOptions : []} loading={modelStatus === "loading"} error={modelStatus === "error"} onRetry={() => setModelRetry((n) => n + 1)} onChange={(value) => { setModel(value); setVersion(""); }} />
            </div>
            <p className="discovery-help muted">
              A FIPE fornece descrições completas de modelo e versão. Selecione uma descrição ou digite o modelo manualmente; a correspondência com anúncios pode variar entre fontes. Se usar a descrição completa, deixe a versão opcional em branco.
            </p>
            <label>
              Versão{" "}
              <small>
                Opcional · correspondência com a identificação da fonte
              </small>
              <input
                name="version"
                list="known-versions"
                maxLength={120}
                placeholder="Ex.: XEi 2.0"
                value={version}
                autoComplete="off"
                onChange={(event) => setVersion(event.target.value)}
              />
              <datalist id="known-versions">
                {suggestions.versions.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </label>
            <div className="form-grid two">
              <label>
                UF
                <select
                  name="state"
                  value={state}
                  onChange={(event) => {
                    setState(event.target.value);
                    setCity("");
                    setCityOptions([]);
                    setCityOptionsState("");
                  }}
                >
                  {states.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <SearchCombobox label="Cidade" name="city" required maxLength={120} placeholder={`Cidade em ${state}`} value={city} options={cityOptionsState === state ? cityOptions : []} loading={cityStatus === "loading"} error={cityStatus === "error"} onRetry={() => setCityRetry((n) => n + 1)} onChange={setCity} />
            </div>
            {catalogNotice && (
              <p className="discovery-warning" role="status">
                {catalogNotice}
              </p>
            )}
            <details
              className="advanced-filters"
              open={advancedOpen}
              onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
            >
              <summary>Mais filtros</summary>
              <div className="form-grid two">
                <label>
                Ano-modelo de
                <input
                  name="yearMin"
                  type="number"
                  min="1900"
                  max="2100"
                  defaultValue={criteria?.yearMin ?? ""}
                />
                </label>
                <label>
                Ano-modelo até
                <input
                  name="yearMax"
                  type="number"
                  min="1900"
                  max="2100"
                  defaultValue={criteria?.yearMax ?? ""}
                />
                </label>
              </div>
              <label>
                Quilometragem máxima
                <input
                  name="mileageMax"
                  type="number"
                  min="0"
                  max="10000000"
                  placeholder="Sem limite"
                  defaultValue={criteria?.mileageMax ?? ""}
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
                  defaultValue={criteria?.priceMax ?? ""}
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
                  defaultChecked={criteria?.privateOnly}
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
                    defaultChecked={
                      criteria ? criteria.sources.includes(source) : !integrations.some((item) => item.configured) || !!integrations.find((item) => item.source === source)?.configured
                    }
                  />
                  {sourceNames[source]}{!integrations.find((item) => item.source === source)?.configured ? " · configuração pendente" : ""}
                </label>
              ))}
            </fieldset>
            <p className="discovery-help muted">Fontes sem conexão podem ser salvas nos critérios para consultar depois de configuradas.</p>
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
                Uma página por fonte. OLX: 1 crédito Gecko; Webmotors: 2
                créditos Reef. Uma cidade nova na OLX pode exigir 1 crédito Reef
                adicional. Limites e saldo gratuito são verificados antes da
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
                  setSelected(e.target.value);
                  setError("");
                  setNotice("");
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
            {active && (
              <Link
                className="button"
                href={`/radares?busca=${encodeURIComponent(active.id)}`}
              >
                <Radio size={16} /> Criar alerta desta busca
              </Link>
            )}
          </div>
          {busy ? (
            <div className="empty-state" role="status">
              <Search size={26} />
              <h2>Consultando os anúncios</h2>
              <p>
                A consulta pode levar alguns instantes. Os cliques repetidos são
                bloqueados.
              </p>
            </div>
          ) : loading ? (
            <p role="status">Carregando buscas…</p>
          ) : !run ? (
            <div className="empty-state">
              <Search size={28} />
              <h2>
                {active
                  ? "Critérios prontos para consultar"
                  : "Comece pelo carro que procura"}
              </h2>
              <p>
                Preencha os filtros e clique em Buscar agora. A comparação
                aparece aqui, sem cadastrar cada anúncio.
              </p>
            </div>
          ) : (
            <>
              <p className="muted">
                Consulta de {observedWhen(run.createdAt)}. A referência é
                recalculada com as observações disponíveis dos últimos 7 dias.
              </p>
              {run.interrupted && (
                <p className="error-box" role="alert">
                  Consulta interrompida. Nenhum resultado completo foi
                  confirmado.
                </p>
              )}
              <div className="source-results">
                {run.sources.map((s) => (
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
                      {observedWhen(s.observedAt)} · {s.listings.length}{" "}
                      anúncios recebidos para candidatos e referência.
                    </small>
                  </details>
                ))}
              </div>
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
                    {hasValidComparison && <option value="discount">Maior percentual abaixo da média</option>}
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
                  searchId={active?.id}
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
        </section>
      </div>
    </div>
  );
}
