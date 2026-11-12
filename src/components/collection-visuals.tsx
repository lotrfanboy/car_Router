"use client";
import { useState } from "react";
import Link from "next/link";
import { CarFront } from "lucide-react";
import {
  collectionHighlights,
  collectionPath,
  collectionView,
  type CollectionEntry,
} from "@/lib/vehicle-collection";
import { money, number } from "@/lib/vehicle";
import { PriceHistory, usePriceHistory } from "./vehicle-analysis";
import styles from "./collection-visuals.module.css";
export const comparisonColors = ["#ffb3b4", "#80cfff", "#9bdfa8", "#f5cf7d"];
export function CollectionPhoto({ entry }: { entry: CollectionEntry }) {
  const row = collectionView(entry);
  const [failed, setFailed] = useState(false);
  return row.imageUrl && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={row.imageUrl}
      alt={row.title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={styles.noPhoto} role="img" aria-label="Foto não disponível">
      <CarFront size={36} />
      <span>Foto não disponível</span>
    </div>
  );
}
export function CollectionPreview({
  entry,
  index = 0,
  origin = "comparar",
}: {
  entry: CollectionEntry;
  index?: number;
  origin?: "salvos" | "comparar";
}) {
  const row = collectionView(entry);
  return (
    <article
      className={styles.preview}
      style={{ borderTopColor: comparisonColors[index % 4] }}
    >
      <Link className={styles.photo} href={collectionPath(entry, origin)}>
        <CollectionPhoto entry={entry} />
      </Link>
      <div className={styles.previewBody}>
        <span
          className={styles.origin}
          style={{ color: comparisonColors[index % 4] }}
        >
          {index + 1} · {row.origin} · {row.source}
        </span>
        <h2>
          <Link href={collectionPath(entry, origin)}>{row.title}</Link>
        </h2>
        <strong className={styles.price}>{money(row.priceCents)}</strong>
        <p>
          {row.modelYear ?? "Ano não informado"} ·{" "}
          {row.mileage === null
            ? "Km não informado"
            : `${number(row.mileage)} km`}{" "}
          ·{" "}
          {[row.city, row.state].filter(Boolean).join("/") ||
            "Local não informado"}
        </p>
        <span className={styles.technical}>
          {[
            row.technical.engine,
            row.technical.transmission,
            row.technical.fuel,
          ]
            .filter(Boolean)
            .join(" · ") || "Dados técnicos não informados"}
        </span>
      </div>
    </article>
  );
}
export function ComparisonVisuals({
  entries,
  selectedCount = entries.length,
}: {
  entries: CollectionEntry[];
  selectedCount?: number;
}) {
  const summary = collectionHighlights(entries),
    rows = summary.rows;
  const prices = rows.filter((r) => r.priceCents !== null && r.priceCents > 0),
    maxPrice = Math.max(1, ...prices.map((r) => r.priceCents!));
  const points = rows.flatMap((r, index) =>
    r.priceCents !== null && r.priceCents > 0 && r.mileage !== null
      ? [{ ...r, index }]
      : [],
  );
  const maxKm = Math.max(1, ...points.map((p) => p.mileage!)),
    maxPointPrice = Math.max(1, ...points.map((p) => p.priceCents!));
  const facts = [
    {
      label: "Menor preço informado",
      value: money(summary.lowestPrice),
      detail: rows
        .filter(
          (r) =>
            r.priceCents === summary.lowestPrice &&
            summary.lowestPrice !== null,
        )
        .map((r) => r.title)
        .join(" / "),
      color: comparisonColors[0],
    },
    {
      label: "Menor quilometragem",
      value:
        summary.lowestMileage === null
          ? "Não informada"
          : `${number(summary.lowestMileage)} km`,
      detail: rows
        .filter(
          (r) =>
            r.mileage === summary.lowestMileage &&
            summary.lowestMileage !== null,
        )
        .map((r) => r.title)
        .join(" / "),
      color: comparisonColors[1],
    },
    {
      label: "Ano-modelo mais recente",
      value: summary.newestYear ?? "Não informado",
      detail: rows
        .filter(
          (r) =>
            r.modelYear === summary.newestYear && summary.newestYear !== null,
        )
        .map((r) => r.title)
        .join(" / "),
      color: comparisonColors[2],
    },
  ];
  return (
    <>
      <div className={styles.previews}>
        {entries.map((entry, index) => (
          <CollectionPreview
            entry={entry}
            key={rows[index].key}
            index={index}
          />
        ))}
      </div>
      <div className={styles.facts}>
        {facts.map((fact) => (
          <section key={fact.label} className={styles.fact}>
            <span style={{ color: fact.color }}>{fact.label}</span>
            <strong>{fact.value}</strong>
            <p>{fact.detail || "Sem dados disponíveis neste critério"}</p>
          </section>
        ))}
      </div>
      <p className={styles.note}>
        Cada destaque considera somente o critério indicado. As versões, os anos
        e a condição podem ser diferentes; não existe um vencedor geral.
      </p>
      <div className={styles.chartGrid}>
        <section className={styles.chart}>
          <div className={styles.chartHeading}>
            <div>
              <span className="eyebrow">VALORES DA SELEÇÃO</span>
              <h2>O preço de cada escolha</h2>
            </div>
            <span>
              {prices.length}/{selectedCount} preços
            </span>
          </div>
          {prices.length ? (
            <div
              className={styles.bars}
              role="img"
              aria-label={`Preços anunciados: ${rows.map((r, index) => `${index + 1}: ${r.title}, ${money(r.priceCents)}`).join("; ")}`}
            >
              {rows.map((r, index) => (
                <div className={styles.barRow} key={r.key}>
                  <div>
                    <span style={{ color: comparisonColors[index] }}>
                      {index + 1} · {r.model || r.title}
                    </span>
                    <strong>{money(r.priceCents)}</strong>
                  </div>
                  {r.priceCents !== null && r.priceCents > 0 ? (
                    <div className={styles.track}>
                      <span
                        style={{
                          width: `${(r.priceCents / maxPrice) * 100}%`,
                          background: comparisonColors[index],
                        }}
                      />
                    </div>
                  ) : (
                    <p>Preço não informado; sem barra</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.note}>
              Os registros selecionados não têm preços informados.
            </p>
          )}
          <p className={styles.note}>
            {summary.priceRange === null
              ? "Informe pelo menos dois preços para calcular a diferença entre extremos."
              : `${money(summary.priceRange)} entre o menor e o maior preço informado. Isso não é desconto de mercado.`}
          </p>
        </section>
        <section className={styles.chart}>
          <div className={styles.chartHeading}>
            <div>
              <span className="eyebrow">PREÇO × QUILOMETRAGEM</span>
              <h2>Diferenças em perspectiva</h2>
            </div>
            <span>
              {points.length}/{selectedCount} completos
            </span>
          </div>
          {points.length >= 2 ? (
            <svg
              viewBox="0 0 640 280"
              role="img"
              aria-label="Preço por quilometragem dos registros selecionados. Os valores completos estão na ficha comparativa."
            >
              <path d="M85 30V225H610 M85 125H610" className={styles.guide} />
              <text x="5" y="35">
                {money(maxPointPrice)}
              </text>
              <text x="5" y="225">
                R$ 0
              </text>
              <text x="85" y="255">
                0 km
              </text>
              <text x="475" y="255">
                {number(maxKm)} km
              </text>
              {points.map((p) => (
                <g key={p.key}>
                  <circle
                    cx={90 + (p.mileage! / maxKm) * 490}
                    cy={220 - (p.priceCents! / maxPointPrice) * 175}
                    r="10"
                    fill={comparisonColors[p.index]}
                  />
                  <text
                    x={90 + (p.mileage! / maxKm) * 490}
                    y={200 - (p.priceCents! / maxPointPrice) * 175}
                    textAnchor="middle"
                    fill={comparisonColors[p.index]}
                  >
                    {p.index + 1}
                  </text>
                  <title>
                    {p.index + 1}: {p.title}; {money(p.priceCents)};{" "}
                    {number(p.mileage!)} km
                  </title>
                </g>
              ))}
            </svg>
          ) : (
            <div className={styles.chartEmpty}>
              São necessários dois registros com preço e km para desenhar esta
              comparação.
            </div>
          )}
          <div className={styles.legend}>
            {rows.map((r, index) => (
              <span key={r.key}>
                <i style={{ background: comparisonColors[index] }} />
                {index + 1} · {r.model || r.source}
              </span>
            ))}
          </div>
          <p className={styles.note}>
            Somente sua seleção. Posição no gráfico não avalia conservação,
            histórico ou preço justo. Dados ausentes não viram zero.
          </p>
        </section>
      </div>
    </>
  );
}
export function CollectionHistory({ entry }: { entry: CollectionEntry }) {
  const row = collectionView(entry);
  const endpoint =
    entry.kind === "listing"
      ? `/api/discoveries/${entry.listing.source}/${encodeURIComponent(entry.listing.externalId)}/prices`
      : `/api/vehicles/${encodeURIComponent(entry.vehicle.id)}/prices`;
  const history = usePriceHistory(row.key, row.priceCents ?? 0, endpoint);
  return (
    <article className={styles.historyCard}>
      <h2>{row.title}</h2>
      <p className={styles.note}>
        {row.origin} · {row.source}
      </p>
      <PriceHistory history={history} origin={entry.kind} idPrefix={row.key} />
    </article>
  );
}
