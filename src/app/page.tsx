"use client";
import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Radar,
  Search,
  ScanLine,
  ChartNoAxesCombined,
  Bookmark,
  SlidersHorizontal,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import {
  Empty,
  PageHeading,
  VehicleCard,
  VehicleImage,
} from "@/components/vehicle-ui";
import { marketSummary, filterIntelligentVehicles } from "@/lib/intelligence";
import { defaultFilters, money, number } from "@/lib/vehicle";
export default function Dashboard() {
  const { vehicles } = useWorkspace();
  const summary = useMemo(() => marketSummary(vehicles), [vehicles]);
  const highlights = useMemo(
    () =>
      filterIntelligentVehicles(vehicles, {
        ...defaultFilters,
        sort: "opportunity",
      }).slice(0, 3),
    [vehicles],
  );
  const photographed = highlights.find((v) => v.imageUrl);
  const favorites = vehicles.filter((v) => v.favorite).slice(0, 3);
  const sources = new Set(vehicles.map((v) => v.source));
  const referenceCount = vehicles.filter(
    (v) => v.referenceCents != null,
  ).length;
  const qualified = vehicles.filter(
    (v) => v.version && v.fuel && v.state,
  ).length;
  const metrics = [
    {
      label: "Anúncios no radar",
      value: number(summary.count),
      detail: `${summary.newCount} cadastrados nos últimos 30 dias`,
      href: "/veiculos",
    },
    {
      label: "Preço mediano",
      value:
        summary.medianPriceCents === null
          ? "—"
          : money(summary.medianPriceCents),
      detail: "Preços pedidos · catálogo completo",
      href: "/mercado",
    },
    {
      label: "Oportunidades na amostra",
      value: number(summary.opportunitiesCount),
      detail: "Pelo menos 5 comparáveis qualificados",
      href: "/veiculos?classification=opportunities",
    },
    {
      label: "Reduções registradas",
      value: number(summary.reducedCount),
      detail: "Última alteração · últimos 30 dias",
      href: "/veiculos?reduced=true",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="INTELIGÊNCIA PARA DECIDIR MELHOR"
        title="Visão geral"
        description="Uma leitura clara do mercado que você acompanha."
      >
        <Link href="/mercado" className="button small">
          <ChartNoAxesCombined size={15} /> Explorar mercado
        </Link>
      </PageHeading>
      <section className="editorial-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow">
            <span /> SEU RADAR AUTOMOTIVO
          </div>
          <h2 id="hero-title">
            A próxima oportunidade.
            <br />
            <em>Vista em perspectiva.</em>
          </h2>
          <p>
            Conecte anúncios, referências e comparáveis.
            <br />
            Cada preço com contexto. Cada decisão, sua.
          </p>
          <div className="hero-actions">
            <Link href="/veiculos" className="button primary">
              Explorar o radar <ArrowRight size={15} />
            </Link>
            <Link href="/buscar" className="hero-secondary">
              Buscar nos portais <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
        {photographed ? (
          <Link className="hero-vehicle" href={`/veiculos/${photographed.id}`}>
            <VehicleImage vehicle={photographed} />
            <span>
              {photographed.brand} {photographed.model}
              <small>
                Fotografia do anúncio cadastrado <ArrowUpRight size={13} />
              </small>
            </span>
          </Link>
        ) : (
          <div className="hero-instrument" aria-hidden="true">
            <div className="orbital orbit-one" />
            <div className="orbital orbit-two" />
            <div className="orbital orbit-three" />
            <div className="orbital orbit-four" />
            <div className="instrument-cross" />
            <span className="instrument-center">
              <Radar size={31} strokeWidth={1.3} />
            </span>
            <span className="instrument-point" />
            <span className="instrument-label">
              OBSERVAR · ANALISAR · DECIDIR
            </span>
            <span className="instrument-coordinate">BR / RADAR</span>
          </div>
        )}
      </section>
      <div className="metrics">
        {metrics.map((m) => (
          <Link href={m.href} className="metric" key={m.label}>
            <div>
              {m.label}
              <ArrowUpRight size={14} />
            </div>
            <strong>{m.value}</strong>
            <small>{m.detail}</small>
          </Link>
        ))}
      </div>
      <div className="dashboard-scope">
        <span>
          <span className="status-dot" /> Amostra: {number(summary.count)}{" "}
          anúncios cadastrados · {sources.size} origens informadas
        </span>
        <span>
          Último preço registrado:{" "}
          {summary.latestPriceRecord
            ? new Date(summary.latestPriceRecord).toLocaleDateString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })
            : "nenhum"}
        </span>
      </div>
      <div className="section-heading">
        <h2>
          <span className="section-number">01</span> Destaques do radar
        </h2>
        <Link href="/veiculos">
          Ver todos os veículos <ArrowRight size={15} />
        </Link>
      </div>
      {vehicles.length ? (
        <div className="cards">
          {highlights.map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
          ))}
        </div>
      ) : (
        <div className="overview-empty-grid">
          <Empty description="Adicione anúncios reais ao catálogo para acompanhar preços, comparar veículos e descobrir oportunidades com contexto." />
          <aside className="panel coverage-panel">
            <div className="eyebrow">UM RADAR COM CRITÉRIO</div>
            <h2>Comece com uma boa base.</h2>
            <div className="coverage-step">
              <Search size={18} />
              <div>
                <strong>Encontre nos portais</strong>
                <p>Buscas manuais em OLX e Webmotors, conforme configuração.</p>
              </div>
            </div>
            <div className="coverage-step">
              <ScanLine size={18} />
              <div>
                <strong>Organize o que interessa</strong>
                <p>
                  Cadastre o anúncio e os atributos que tornam a comparação
                  precisa.
                </p>
              </div>
            </div>
            <div className="coverage-step">
              <SlidersHorizontal size={18} />
              <div>
                <strong>Analise com contexto</strong>
                <p>
                  Preços observados, custos ajustáveis e critérios
                  transparentes.
                </p>
              </div>
            </div>
            <Link href="/buscar" className="text-link">
              Configurar sua primeira busca <ArrowRight size={14} />
            </Link>
          </aside>
        </div>
      )}
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="section-heading">
            <h2>
              <span className="section-number">02</span> Panorama da amostra
            </h2>
            <Link href="/mercado">
              Abrir análise <ArrowUpRight size={15} />
            </Link>
          </div>
          {summary.groups.length ? (
            <div className="overview-groups">
              {summary.groups.slice(0, 5).map((g) => (
                <Link
                  key={g.key}
                  href={`/veiculos?exactMatch=true&brand=${encodeURIComponent(g.brand)}&model=${encodeURIComponent(g.model)}`}
                  className="overview-group"
                >
                  <span>
                    <strong>
                      {g.brand} {g.model}
                    </strong>
                    <small>{g.count} anúncios na amostra</small>
                  </span>
                  <div className="group-track">
                    <span
                      style={{ width: `${(g.count / summary.count) * 100}%` }}
                    />
                  </div>
                  <span>
                    <strong>{money(g.medianPriceCents)}</strong>
                    <small>preço mediano</small>
                  </span>
                  <ArrowUpRight size={14} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="analytical-empty">
              <ChartNoAxesCombined size={27} strokeWidth={1.2} />
              <strong>O mercado começa pelos dados.</strong>
              <p>
                A distribuição de preços e a comparação entre modelos aparecem
                quando houver anúncios no catálogo.
              </p>
            </div>
          )}
          <p className="panel-footnote">
            Preços anunciados da sua amostra. Não representam vendas, demanda ou
            todo o mercado brasileiro.
          </p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>
              <span className="section-number">03</span> Em acompanhamento
            </h2>
            <Link href="/favoritos">
              Favoritos <ArrowUpRight size={15} />
            </Link>
          </div>
          {favorites.length ? (
            favorites.map((v) => (
              <Link
                className="favorite-summary"
                key={v.id}
                href={`/veiculos/${v.id}`}
              >
                <span>
                  <strong>
                    {v.brand} {v.model}
                  </strong>
                  <small>{v.version || "Versão não informada"}</small>
                </span>
                <strong>{money(v.priceCents)}</strong>
                <ArrowUpRight size={14} />
              </Link>
            ))
          ) : (
            <div className="analytical-empty">
              <Bookmark size={26} strokeWidth={1.2} />
              <strong>As possibilidades que merecem atenção.</strong>
              <p>
                Favorite veículos e salve filtros. Mudanças de preço registradas
                ficam disponíveis no monitoramento.
              </p>
            </div>
          )}
          <div className="coverage-summary">
            <span>
              Referência manual{" "}
              <strong>
                {referenceCount}/{vehicles.length}
              </strong>
            </span>
            <span>
              Versão, combustível e UF{" "}
              <strong>
                {qualified}/{vehicles.length}
              </strong>
            </span>
          </div>
          <Link href="/configuracoes" className="text-link">
            Entenda os critérios da análise <ArrowRight size={14} />
          </Link>
        </section>
      </div>
    </>
  );
}
