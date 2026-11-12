"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  CarFront,
  ExternalLink,
  MapPin,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  criteriaLocation,
  publicListingUrl,
  sourceNames,
} from "@/lib/discovery";
import {
  emptyRadarFilters,
  filterRadarOffers,
  radarStateLabels,
  radarYears,
  type RadarDetail,
  type RadarOffer,
  type RadarOfferFilters,
} from "@/lib/radar-presentation";
import { money, number } from "@/lib/vehicle";
import { listingPath, observedWhen, SaveListing } from "./listing-card";
import styles from "./radar-workspace.module.css";
import { RadarControl } from "./radar-control";

function OfferCard({
  offer,
  searchId,
}: {
  offer: RadarOffer;
  searchId: string;
}) {
  const { listing: l, event } = offer;
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className={styles.offer}>
      <div className={styles.photo}>
        {l.imageUrl && !imageFailed ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={l.imageUrl}
              alt={l.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
          </>
        ) : (
          <div className={styles.noPhoto}>
            <CarFront size={30} />
            <span>Foto indisponível</span>
          </div>
        )}
        <span className={styles.source}>{sourceNames[l.source]}</span>
      </div>
      <div className={styles.offerBody}>
        {event && (
          <span
            className={styles.event}
            title={`Registrado em ${observedWhen(event.at)}`}
          >
            {event.kind === "new_listing"
              ? "Novo para o radar"
              : "Queda de preço registrada"}
          </span>
        )}
        {offer.matchStatus === "uncertain" && (
          <span className={styles.review}>Correspondência a conferir</span>
        )}
        {offer.historical && (
          <span className={styles.review}>Consulta anterior</span>
        )}
        <h3>
          <Link
            href={`${listingPath(l)}?busca=${encodeURIComponent(searchId)}`}
            prefetch={false}
          >
            {l.title}
          </Link>
        </h3>
        <strong className={styles.price}>
          {l.priceCents === null ? "Preço não informado" : money(l.priceCents)}
        </strong>
        {event?.kind === "price_drop" && (
          <small className={styles.fine}>
            Preço anterior registrado: {money(event.previousPriceCents!)}
          </small>
        )}
        <div className={styles.specs}>
          <span>{l.modelYear ?? "Ano não informado"}</span>
          <span>
            {l.mileage === null
              ? "Km não informado"
              : `${number(l.mileage)} km`}
          </span>
        </div>
        <p className={styles.location}>
          <MapPin size={14} />
          {l.city ?? "Cidade não informada"}/{l.state ?? "UF não informada"}
        </p>
        {offer.matchStatus === "uncertain" && (
          <p className={styles.fine}>
            Os dados disponíveis não confirmam todos os critérios. Esta oferta
            não entra nos e-mails de novas oportunidades.
          </p>
        )}
        {offer.matchStatus === "uncertain" && l.reasons.length > 0 && (
          <details className={styles.fine}>
            <summary>O que conferir</summary>
            <ul>
              {l.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </details>
        )}
        <div className={styles.offerActions}>
          <SaveListing listing={l} />
          <Link
            className="text-link"
            href={`${listingPath(l)}?busca=${encodeURIComponent(searchId)}`}
            prefetch={false}
          >
            Ver detalhes <ArrowUpRight size={14} />
          </Link>
          {publicListingUrl(l.url, l.source) && (
            <a
              className="button small"
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Anúncio original <ExternalLink size={13} />
            </a>
          )}
        </div>
        <small className={styles.observed}>
          Consultado em {observedWhen(l.observedAt)} · Brasília
        </small>
      </div>
    </article>
  );
}

export function RadarDetailWorkspace({ data }: { data: RadarDetail }) {
  const { radar, offers } = data;
  const [filters, setFilters] = useState<RadarOfferFilters>({
    ...emptyRadarFilters,
  });
  const set = (key: keyof RadarOfferFilters, value: string) =>
    setFilters((previous) => ({ ...previous, [key]: value }));
  const visible = useMemo(
    () => filterRadarOffers(offers, filters),
    [offers, filters],
  );
  const confirmed = offers.filter((o) => o.matchStatus === "confirmed").length;
  const uncertain = offers.length - confirmed;
  const cities = [
    ...new Set(
      offers
        .map((o) => o.listing.city)
        .filter((city): city is string => !!city),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const sourceIds = [...new Set(offers.map((o) => o.listing.source))];
  const delivered = radar.emailDeliveries.find(
    (d) => d.status === "delivered" && d.deliveredAt,
  );
  const lastDelivery = radar.emailDeliveries[0];
  return (
    <div className={`focus-workspace ${styles.workspace}`}>
      <Link href="/radares" className={styles.back}>
        <ArrowLeft size={15} /> Meus radares
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">OFERTAS DO SEU RADAR</div>
          <h1>{radar.name}</h1>
          <p className="muted">
            {radar.criteria.brand} {radar.criteria.model} ·{" "}
            {radarYears(radar.criteria)} · {criteriaLocation(radar.criteria)}
          </p>
        </div>
        <span className={styles.state} data-state={radar.state}>
          <span />
          {radarStateLabels[radar.state]}
        </span>
      </div>
      <RadarControl id={radar.id} enabled={radar.enabled} />
      {radar.state === "paused" ? (
        <div className={styles.notice}>
          <Bell size={18} />
          <div>
            <strong>Este radar está pausado</strong>
            <p>
              As ofertas abaixo são de consultas já realizadas. O monitoramento
              e novos avisos deste radar estão interrompidos.
            </p>
          </div>
        </div>
      ) : ["pending", "error"].includes(radar.state) ? (
        <div className={styles.notice}>
          <Bell size={18} />
          <div>
            <strong>
              {radar.state === "error"
                ? "Não foi possível concluir a última consulta"
                : "O monitoramento ainda não está disponível"}
            </strong>
            <p>
              As ofertas salvas continuam disponíveis.{" "}
              <Link href="/configuracoes#radares">
                Ver situação da plataforma
              </Link>
            </p>
          </div>
        </div>
      ) : null}
      <div className={styles.detailLayout}>
        <section className={styles.results} aria-label="Ofertas do radar">
          <div className={styles.sectionLine}>
            <div>
              <h2>Ofertas encontradas</h2>
              <p className={styles.fine}>
                Dados da busca vinculada
                {data.lastConsultedAt
                  ? ` · última consulta em ${observedWhen(data.lastConsultedAt)}`
                  : " · ainda sem consulta"}
              </p>
            </div>
          </div>
          <div className={styles.tabs} aria-label="Correspondência das ofertas">
            <button
              aria-pressed={filters.match === "confirmed"}
              onClick={() => set("match", "confirmed")}
            >
              Correspondentes <span>{confirmed}</span>
            </button>
            <button
              aria-pressed={filters.match === "uncertain"}
              onClick={() => set("match", "uncertain")}
            >
              A conferir <span>{uncertain}</span>
            </button>
          </div>
          <div className={styles.filters}>
            <div className={styles.filterRow}>
              <label className={styles.query}>
                Pesquisar nas ofertas
                <div>
                  <Search size={16} />
                  <input
                    type="search"
                    value={filters.query}
                    placeholder="Título ou versão"
                    onChange={(e) => set("query", e.target.value)}
                  />
                </div>
              </label>
              <label>
                Fonte
                <select
                  value={filters.source}
                  onChange={(e) => set("source", e.target.value)}
                >
                  <option value="">Todas as fontes</option>
                  {sourceIds.map((source) => (
                    <option key={source} value={source}>
                      {sourceNames[source]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ordenar por
                <select
                  value={filters.sort}
                  onChange={(e) => set("sort", e.target.value)}
                >
                  <option value="recent">Consulta mais recente</option>
                  <option value="priceAsc">Menor preço</option>
                  <option value="priceDesc">Maior preço</option>
                  <option value="year">Mais novos por ano</option>
                  <option value="mileage">Menor quilometragem</option>
                </select>
              </label>
            </div>
            <details className={styles.refine}>
              <summary>
                <SlidersHorizontal size={15} /> Refinar ofertas
              </summary>
              <div className={styles.advanced}>
                <label>
                  Cidade
                  <select
                    value={filters.city}
                    onChange={(e) => set("city", e.target.value)}
                  >
                    <option value="">Todas as cidades</option>
                    {cities.map((city) => (
                      <option key={city}>{city}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Ano mínimo
                  <input
                    type="number"
                    min="1900"
                    max="2100"
                    value={filters.yearMin}
                    onChange={(e) => set("yearMin", e.target.value)}
                    placeholder="Sem mínimo"
                  />
                </label>
                <label>
                  Ano máximo
                  <input
                    type="number"
                    min="1900"
                    max="2100"
                    value={filters.yearMax}
                    onChange={(e) => set("yearMax", e.target.value)}
                    placeholder="Sem máximo"
                  />
                </label>
                <label>
                  Preço máximo (R$)
                  <input
                    type="number"
                    min="0"
                    value={filters.priceMax}
                    onChange={(e) => set("priceMax", e.target.value)}
                    placeholder="Sem limite"
                  />
                </label>
                <label>
                  Quilometragem máxima
                  <input
                    type="number"
                    min="0"
                    value={filters.mileageMax}
                    onChange={(e) => set("mileageMax", e.target.value)}
                    placeholder="Sem limite"
                  />
                </label>
                <label>
                  Eventos registrados
                  <select
                    value={filters.event}
                    onChange={(e) => set("event", e.target.value)}
                  >
                    <option value="">Todas as ofertas</option>
                    <option value="new_listing">Novos para este radar</option>
                    <option value="price_drop">Quedas de preço</option>
                  </select>
                </label>
              </div>
            </details>
            <div className={styles.sectionLine}>
              <span className={styles.fine}>
                {visible.length} {visible.length === 1 ? "oferta" : "ofertas"}{" "}
                nesta seleção
              </span>
              <button
                className="text-button"
                onClick={() =>
                  setFilters({ ...emptyRadarFilters, match: filters.match })
                }
              >
                Limpar filtros
              </button>
            </div>
          </div>
          {filters.match === "uncertain" && uncertain > 0 && (
            <p className={styles.reviewNote}>
              Estas ofertas precisam de conferência e ficam separadas das
              correspondências confirmadas.
            </p>
          )}
          {visible.length ? (
            <div className={styles.offerGrid}>
              {visible.map((o) => (
                <OfferCard
                  key={`${o.listing.source}:${o.listing.externalId}`}
                  offer={o}
                  searchId={radar.searchId}
                />
              ))}
            </div>
          ) : (
            <div className={`panel ${styles.empty}`}>
              <Search size={28} />
              <h2>
                {offers.length
                  ? "Nenhuma oferta nesta seleção"
                  : "Ainda não há ofertas para mostrar"}
              </h2>
              <p>
                {offers.length
                  ? "Experimente outros filtros ou confira a outra aba."
                  : "As ofertas aparecerão aqui após uma consulta concluída. Os critérios do radar estão salvos."}
              </p>
              {offers.length > 0 && (
                <button
                  className="button"
                  onClick={() => setFilters({ ...emptyRadarFilters })}
                >
                  Ver correspondentes
                </button>
              )}
            </div>
          )}
          <p className={styles.fine}>
            Os resultados refletem o que as fontes retornaram nas consultas
            salvas. Preço e disponibilidade podem mudar; confira o anúncio
            original. “Novo para o radar” indica a primeira observação após a
            consulta inicial, sem confirmar a data de publicação.
          </p>
        </section>
        <aside className={styles.sidebar} aria-label="Sobre este radar">
          <section className="panel">
            <h2>O que você procura</h2>
            <dl className={styles.criteria}>
              <div>
                <dt>Carro</dt>
                <dd>
                  {radar.criteria.brand} {radar.criteria.model}
                </dd>
              </div>
              <div>
                <dt>Ano-modelo</dt>
                <dd>{radarYears(radar.criteria)}</dd>
              </div>
              <div>
                <dt>Localização</dt>
                <dd>{criteriaLocation(radar.criteria)}</dd>
              </div>
              <div>
                <dt>Preço máximo</dt>
                <dd>
                  {radar.criteria.priceMax === null
                    ? "Sem limite"
                    : money(radar.criteria.priceMax * 100)}
                </dd>
              </div>
              {radar.criteria.mileageMin != null && (
                <div>
                  <dt>Quilometragem mínima</dt>
                  <dd>{number(radar.criteria.mileageMin)} km</dd>
                </div>
              )}
              <div>
                <dt>Quilometragem máxima</dt>
                <dd>
                  {radar.criteria.mileageMax === null
                    ? "Sem limite"
                    : `${number(radar.criteria.mileageMax)} km`}
                </dd>
              </div>
              <div>
                <dt>Vendedor</dt>
                <dd>
                  {radar.criteria.privateOnly
                    ? "Somente particulares"
                    : "Particulares e lojas"}
                </dd>
              </div>
            </dl>
            <Link
              href={`/buscar?busca=${radar.searchId}`}
              className="text-link"
            >
              Abrir busca vinculada <ArrowUpRight size={14} />
            </Link>
          </section>
          <section className="panel">
            <h2>Seus avisos</h2>
            <p>
              {radar.channel === "in_app"
                ? "Avisos neste aplicativo."
                : "Oportunidades no aplicativo e por e-mail."}
            </p>
            <p className={styles.fine}>
              {!data.emailEnabled
                ? "Envio automático de e-mail desativado neste ambiente."
                : radar.state === "paused"
                  ? "Este radar está pausado; novos resumos não serão gerados."
                  : "Resumos de novos anúncios confirmados são gerados após a primeira verificação. Quedas de preço ficam no aplicativo."}
            </p>
            <p className={styles.fine}>
              {delivered
                ? `Último resumo entregue em ${observedWhen(delivered.deliveredAt!)}.`
                : lastDelivery
                  ? lastDelivery.status === "accepted"
                    ? "Um resumo foi aceito pelo provedor; a entrega ainda não foi confirmada."
                    : "Há um resumo sem entrega confirmada. Confira a situação nas configurações."
                  : "Nenhum resumo enviado por este radar."}
            </p>
          </section>
          <section className="panel">
            <h2>Última cobertura</h2>
            {data.sources.length ? (
              data.sources.map((s) => (
                <div className={styles.coverage} key={s.source}>
                  <strong>
                    {sourceNames[s.source as keyof typeof sourceNames] ??
                      s.source}
                  </strong>
                  <span>
                    {s.status !== "ok"
                      ? "Última tentativa sem sucesso"
                      : s.partial
                        ? "Amostra parcial de anúncios"
                        : "Consulta concluída"}
                  </span>
                  {s.historical && (
                    <small>Ofertas de uma consulta anterior preservadas.</small>
                  )}
                </div>
              ))
            ) : (
              <p className={styles.fine}>Nenhuma consulta registrada.</p>
            )}
            <p className={styles.fine}>
              A plataforma organiza as verificações periódicas. Abrir esta
              página ou refinar ofertas não faz novas consultas às fontes.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
