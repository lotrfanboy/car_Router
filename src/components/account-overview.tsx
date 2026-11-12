"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Radar, Search } from "lucide-react";
import type { WorkspaceOverview } from "@/lib/workspace-overview";
import { collectionView, collectionPath } from "@/lib/vehicle-collection";
import { money, number } from "@/lib/vehicle";
import { useVehicleCollection } from "./use-vehicle-collection";
import {
  CollectionPhoto,
  CollectionPreview,
  comparisonColors,
} from "./collection-visuals";
import styles from "./collection-visuals.module.css";
export function AccountOverview() {
  const collection = useVehicleCollection();
  const [state, setState] = useState<{
      data: WorkspaceOverview | null;
      error: string;
    }>({ data: null, error: "" }),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/overview", { cache: "no-store", signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<WorkspaceOverview>;
      })
      .then((data) => {
        if (!abort.signal.aborted) setState({ data, error: "" });
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setState({
            data: null,
            error: "Não foi possível carregar os indicadores deste espaço.",
          });
      });
    return () => abort.abort();
  }, [attempt]);
  const rows = useMemo(
    () => collection.entries.map(collectionView),
    [collection.entries],
  );
  const recent = useMemo(
    () =>
      [...collection.entries]
        .sort(
          (a, b) =>
            (Date.parse(collectionView(b).observedAt ?? "") || 0) -
            (Date.parse(collectionView(a).observedAt ?? "") || 0),
        )
        .slice(0, 3),
    [collection.entries],
  );
  const featured = recent.find((entry) => collectionView(entry).imageUrl);
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { label: string; count: number; prices: number[] }
    >();
    for (const row of rows) {
      const label =
        [row.brand, row.model].filter(Boolean).join(" ") ||
        "Modelo não identificado";
      const key = label.toLowerCase();
      const item = map.get(key) ?? { label, count: 0, prices: [] };
      item.count++;
      if (row.priceCents !== null && row.priceCents > 0)
        item.prices.push(row.priceCents);
      map.set(key, item);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [rows]);
  const counts = state.data?.counts;
  const metrics = [
    {
      label: "Salvos da busca",
      value: counts?.saved,
      detail: "Ofertas que você decidiu guardar",
      href: "/salvos",
    },
    {
      label: "Cadastros manuais",
      value: counts?.manuals,
      detail: "Dados e históricos informados por você",
      href: "/veiculos",
    },
    {
      label: "Consultas neste mês",
      value: state.data?.activity.count,
      detail: state.data
        ? `${state.data.activity.label} · calendário UTC`
        : "Consultas armazenadas neste ambiente",
      href: "/buscar",
    },
    {
      label: "Seus radares",
      value: counts?.radars,
      detail: state.data
        ? state.data.schedulerEnabled
          ? `${counts?.enabledRadars} habilitados no cadastro`
          : "Monitoramento desligado neste ambiente"
        : "Verificando o estado do ambiente",
      href: "/radares",
    },
  ];
  return (
    <>
      <header className={styles.topHeading}>
        <div>
          <div className="eyebrow">SEU ESPAÇO AUTOMOTIVO</div>
          <h1>Visão geral</h1>
          <p>Suas buscas, escolhas e cadastros em um só lugar.</p>
        </div>
        <Link href="/veiculos/novo" className="button">
          <Plus size={16} /> Incluir manualmente
        </Link>
      </header>
      <section
        className={`editorial-hero ${styles.dashboardHero}`}
        aria-labelledby="overview-hero-title"
      >
        <div className="hero-copy">
          <div className="eyebrow">OBSERVAR · COMPARAR · DECIDIR</div>
          <h2 id="overview-hero-title">
            Mais contexto.
            <br />
            <em>Melhores perguntas.</em>
          </h2>
          <p>
            Encontre nos portais ou inclua manualmente.
            <br />
            Preserve o histórico e compare o que importa para você.
          </p>
          <div className="hero-actions">
            <Link href="/buscar" className="button primary">
              <Search size={16} /> Buscar carros
            </Link>
            <Link href="/comparar" className="button">
              Abrir comparador <ArrowRight size={15} />
            </Link>
          </div>
        </div>
        {featured ? (
          <Link className="hero-vehicle" href={collectionPath(featured)}>
            <CollectionPhoto entry={featured} />
            <span>
              {collectionView(featured).model || collectionView(featured).title}
              <small>
                Foto do seu registro · {collectionView(featured).origin}
              </small>
            </span>
          </Link>
        ) : (
          <div className="hero-instrument" aria-hidden="true">
            <div className="orbital orbit-one" />
            <div className="orbital orbit-two" />
            <div className="orbital orbit-three" />
            <div className="instrument-cross" />
            <span className="instrument-center">
              <Radar size={34} />
            </span>
            <span className="instrument-label">
              SUA PRÓXIMA ESCOLHA COMEÇA NOS DADOS
            </span>
          </div>
        )}
      </section>
      {state.error && (
        <div role="alert" className="error-box">
          {state.error}
          <button
            className="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Tentar indicadores novamente
          </button>
        </div>
      )}
      {collection.listingError && (
        <div role="alert" className="error-box">
          {collection.listingError}
          <button className="button" onClick={collection.retryListings}>
            Tentar salvos novamente
          </button>
        </div>
      )}
      {collection.manualError && (
        <div role="alert" className="error-box">
          Cadastros manuais indisponíveis.
          <button className="button" onClick={collection.retryManuals}>
            Tentar cadastros novamente
          </button>
        </div>
      )}
      <div className={styles.metricGrid}>
        {metrics.map((metric, index) => (
          <Link href={metric.href} key={metric.label} className={styles.metric}>
            <span>{metric.label}</span>
            <strong style={{ color: comparisonColors[index] }}>
              {metric.value === undefined ? "—" : number(metric.value)}
            </strong>
            <small>{metric.detail}</small>
          </Link>
        ))}
      </div>
      <p className={styles.note}>
        {state.data
          ? `${number(state.data.counts.searches)} buscas salvas · ${number(state.data.counts.runs)} consultas armazenadas · ${number(state.data.counts.prices)} observações de preço dos portais. Dados deste ambiente lidos em ${new Date(state.data.readAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
          : state.error
            ? "Indicadores indisponíveis; nenhum valor foi estimado."
            : "Carregando os indicadores armazenados…"}{" "}
        Abrir o painel não consulta os portais.
      </p>
      <div className="section-heading">
        <h2>
          <span className="section-number">01</span> Retome suas escolhas
        </h2>
        <Link href="/salvos">
          Ver todos os registros <ArrowRight size={15} />
        </Link>
      </div>
      {recent.length ? (
        <div className={styles.previews}>
          {recent.map((entry, index) => (
            <CollectionPreview
              key={collectionView(entry).key}
              entry={entry}
              origin="salvos"
              index={index}
            />
          ))}
        </div>
      ) : (
        <section className={`panel ${styles.chart}`}>
          <h2>
            {collection.loading
              ? "Carregando suas escolhas…"
              : "Seu espaço está pronto para começar"}
          </h2>
          <p className={styles.note}>
            Salve uma oferta da busca ou cadastre um veículo manualmente. Fotos
            e informações aparecem quando forem fornecidas.
          </p>
          <Link href="/buscar" className="button primary">
            Encontrar ofertas
          </Link>
        </section>
      )}
      <div className={styles.split}>
        <section className={styles.chart}>
          <div className={styles.chartHeading}>
            <div>
              <span className="eyebrow">02 · PANORAMA DA SUA LISTA</span>
              <h2>O que você acompanha</h2>
            </div>
            <Link href="/salvos">Explorar</Link>
          </div>
          {groups.length ? (
            groups.map((group, index) => (
              <div className={styles.groupRow} key={group.label}>
                <div>
                  <strong>{group.label}</strong>
                  <span>{group.count} registro(s)</span>
                </div>
                <div className={styles.track}>
                  <span
                    style={{
                      width: `${(group.count / Math.max(1, rows.length)) * 100}%`,
                      background: comparisonColors[index % 4],
                    }}
                  />
                </div>
                <p className={styles.note}>
                  {group.prices.length
                    ? `${money(Math.min(...group.prices))} a ${money(Math.max(...group.prices))} · preços informados, versões podem diferir`
                    : "Sem preço informado neste grupo"}
                </p>
              </div>
            ))
          ) : (
            <p className={styles.note}>
              Os grupos aparecem quando houver registros carregados. Nenhuma
              amostra ilustrativa é usada.
            </p>
          )}
          <p className={styles.note}>
            São registros, não carros únicos nem participação de mercado.
            Origens diferentes não são mescladas.
          </p>
        </section>
        <section className={styles.chart}>
          <div className={styles.chartHeading}>
            <div>
              <span className="eyebrow">03 · SUA ATIVIDADE</span>
              <h2>Consultas ao longo do mês</h2>
            </div>
            <Link href="/buscar">Retomar buscas</Link>
          </div>
          {state.data ? (
            <>
              <p className={styles.note}>
                {state.data.activity.label} · dias do mês em UTC
              </p>
              {state.data.activity.buckets.map((bucket, index) => (
                <div className={styles.groupRow} key={bucket.label}>
                  <div>
                    <strong>Dias {bucket.label}</strong>
                    <span>{bucket.count} consulta(s)</span>
                  </div>
                  <div className={styles.track}>
                    <span
                      style={{
                        width: `${(bucket.count / Math.max(1, ...state.data!.activity.buckets.map((b) => b.count))) * 100}%`,
                        background: comparisonColors[index % 4],
                      }}
                    />
                  </div>
                </div>
              ))}
              <p className={styles.note}>
                Cada consulta armazenada conta uma vez, inclusive tentativas com
                falha. Não é contagem de créditos nem de carros encontrados.
              </p>
            </>
          ) : (
            <p className={styles.note}>
              {state.error
                ? "Atividade indisponível."
                : "Carregando atividade…"}
            </p>
          )}
        </section>
      </div>
      <div className={styles.split}>
        <section className={styles.chart}>
          <div className={styles.chartHeading}>
            <h2>Últimas consultas armazenadas</h2>
            <Link href="/buscar">Abrir buscas</Link>
          </div>
          {state.data?.recentSearches.length ? (
            state.data.recentSearches.map((search) => (
              <Link
                href={`/buscar?busca=${encodeURIComponent(search.id)}`}
                className={styles.sourceRow}
                key={search.runId}
              >
                <div>
                  <strong>{search.name}</strong>
                  <p>
                    {new Date(search.observedAt).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </p>
                </div>
                <ArrowRight size={16} />
              </Link>
            ))
          ) : (
            <p className={styles.note}>
              Nenhuma consulta disponível neste carregamento.
            </p>
          )}
        </section>
        <section className={styles.chart}>
          <div className={styles.chartHeading}>
            <h2>Seu próximo passo</h2>
          </div>
          <p className={styles.note}>
            Encontre ofertas, guarde as que interessam e compare os detalhes
            antes de decidir.
          </p>
          <div className={styles.catalogActions}>
            <Link href="/buscar" className="button primary">
              Buscar carros
            </Link>
            <Link href="/comparar" className="button">
              Comparar escolhas
            </Link>
            <Link href="/fipe" className="button">
              Consultar FIPE
            </Link>
            <Link href="/radares" className="button">
              Acompanhar radares
            </Link>
            <Link href="/mercado" className="button">
              Análises do catálogo
            </Link>
            <Link href="/catalogo/visao-geral" className="button">
              Panorama manual
            </Link>
          </div>
        </section>
      </div>
      <section className={styles.chart}>
        <div className={styles.chartHeading}>
          <div>
            <span className="eyebrow">EM ACOMPANHAMENTO</span>
            <h2>Favoritos do catálogo manual</h2>
          </div>
          <Link href="/favoritos">Ver favoritos</Link>
        </div>
        {collection.manuals.some((vehicle) => vehicle.favorite) ? (
          collection.manuals
            .filter((vehicle) => vehicle.favorite)
            .slice(0, 3)
            .map((vehicle) => (
              <Link
                key={vehicle.id}
                href={`/veiculos/${vehicle.id}?origem=salvos`}
                className={styles.sourceRow}
              >
                <div>
                  <strong>
                    {vehicle.brand} {vehicle.model}
                  </strong>
                  <p>
                    Cadastro manual ·{" "}
                    {vehicle.version || "Versão não informada"}
                  </p>
                </div>
                <strong>{money(vehicle.priceCents)}</strong>
              </Link>
            ))
        ) : (
          <p className={styles.note}>
            {collection.manualError
              ? "Favoritos manuais indisponíveis neste carregamento."
              : "Nenhum cadastro manual favoritado neste carregamento."}{" "}
            Os anúncios guardados da busca continuam na sua lista de interesse.
          </p>
        )}
        <Link href="/salvos" className="text-link">
          Abrir salvos e cadastros juntos
        </Link>
      </section>
    </>
  );
}
