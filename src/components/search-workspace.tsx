"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Radio } from "lucide-react";
import {
  searchSchema,
  sourceNames,
  type SearchCriteria,
  type SearchResult,
  type Source,
} from "@/lib/discovery";
import { sortListings } from "@/lib/listing-comparison";
import { states } from "@/lib/vehicle";
import { ListingCard, observedWhen } from "./listing-card";
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
type SearchOption = { code: string; name: string };
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
    [sort, setSort] = useState<"discount" | "price" | "recent">("discount");
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
  const [catalogNotice, setCatalogNotice] = useState("");
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
    fetch("/api/search-options?type=brands")
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<SearchOption[]>;
      })
      .then((options) => {
        if (!cancelled) setBrandOptions(options);
      })
      .catch(() => {
        if (!cancelled)
          setCatalogNotice("Catálogo FIPE indisponível; digitação manual liberada.");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/search-options?type=cities&state=${encodeURIComponent(state)}`)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<SearchOption[]>;
      })
      .then((options) => {
        if (!cancelled) setCityOptions(options);
      })
      .catch(() => {
        if (!cancelled)
          setCatalogNotice("Catálogo de municípios indisponível; digitação manual liberada.");
      });
    return () => {
      cancelled = true;
    };
  }, [state]);
  useEffect(() => {
    let cancelled = false;
    const selectedBrand = brandOptions.find(
      (option) =>
        option.name.localeCompare(brand, "pt-BR", { sensitivity: "base" }) === 0,
    );
    if (!selectedBrand) return;
    fetch(
      `/api/search-options?type=models&brand=${encodeURIComponent(selectedBrand.code)}`,
    )
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<SearchOption[]>;
      })
      .then((options) => {
        if (!cancelled) setModelOptions(options);
      })
      .catch(() => {
        if (!cancelled)
          setCatalogNotice("Modelos FIPE indisponíveis; digitação manual liberada.");
      });
    return () => {
      cancelled = true;
    };
  }, [brand, brandOptions]);
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
      brands: unique([...brandOptions.map((option) => option.name), ...rows.map((r) => r.brand)]),
      models: unique(
        [
          ...modelOptions.map((option) => option.name),
          ...rows.filter((r) => same(r.brand, brand)).map((r) => r.model),
        ],
      ),
      versions: unique(
        rows
          .filter((r) => same(r.brand, brand) && same(r.model, model))
          .map((r) => r.version),
      ),
      cities: unique([
        ...cityOptions.map((option) => option.name),
        ...rows.filter((r) => same(r.state, state)).map((r) => r.city),
      ]),
    };
  }, [brand, brandOptions, cityOptions, model, modelOptions, saved, state, vehicles]);
  const candidates = sortListings(
    run?.sources
      .filter((s) => s.status === "ok")
      .flatMap((s) => s.listings)
      .filter((row) => !row.reasons.length) ?? [],
    sort,
  );
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
            key={`${selected}:${active ? "loaded" : "new"}`}
            onSubmit={submit}
            className="discovery-form"
          >
            <div className="form-grid two">
              <label>
                Marca
                <input
                  name="brand"
                  list="known-brands"
                  required
                  maxLength={80}
                  placeholder="Toyota"
                  value={brand}
                  autoComplete="off"
                  onChange={(event) => {
                    setBrand(event.target.value);
                    setModel("");
                    setVersion("");
                    setModelOptions([]);
                  }}
                />
              </label>
              <label>
                Modelo
                <input
                  name="model"
                  list="known-models"
                  required
                  maxLength={100}
                  placeholder="Corolla"
                  value={model}
                  autoComplete="off"
                  onChange={(event) => {
                    setModel(event.target.value);
                    setVersion("");
                  }}
                />
              </label>
            </div>
            <datalist id="known-brands">
              {suggestions.brands.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
            <datalist id="known-models">
              {suggestions.models.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
            <p className="discovery-help muted">
              Escolha no catálogo FIPE. Se um item não aparecer, digite
              manualmente. Os modelos acompanham a marca escolhida.
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
                  }}
                >
                  {states.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Cidade
                <input
                  name="city"
                  list="known-cities"
                  required
                  maxLength={120}
                  placeholder="Escolha a UF primeiro"
                  value={city}
                  autoComplete="off"
                  onChange={(event) => setCity(event.target.value)}
                />
                <datalist id="known-cities">
                  {suggestions.cities.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </label>
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
                      criteria ? criteria.sources.includes(source) : true
                    }
                  />
                  {sourceNames[source]}
                </label>
              ))}
            </fieldset>
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
                    value={sort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}
                  >
                    <option value="discount">
                      Maior percentual abaixo da média
                    </option>
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
