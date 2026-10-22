"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Listing } from "@/lib/discovery";
import { sourceNames } from "@/lib/discovery";
import { money, number } from "@/lib/vehicle";
import { listingPath, observedWhen } from "./listing-card";

const bandSize = 5_000_000; // R$ 50.000 in cents.
const unique = (values: (string | null | undefined)[]) => [...new Set(values.filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, "pt-BR"));

export function SavedListingCharts({ rows }: { rows: Listing[] }) {
  const [source, setSource] = useState("");
  const [state, setState] = useState("");
  const [model, setModel] = useState("");
  const [axis, setAxis] = useState<"year" | "mileage">("year");
  const filtered = useMemo(() => rows.filter((row) =>
    (!source || row.source === source) && (!state || row.state === state) && (!model || row.model === model),
  ), [rows, source, state, model]);
  const priced = filtered.filter((row) => row.priceCents !== null && row.priceCents > 0);
  const bins = new Map<number, Listing[]>();
  for (const row of priced) {
    const start = Math.floor(row.priceCents! / bandSize) * bandSize;
    bins.set(start, [...(bins.get(start) ?? []), row]);
  }
  const distribution = [...bins].sort(([a], [b]) => a - b);
  const scatter = priced.filter((row) => axis === "year" ? row.modelYear !== null : row.mileage !== null);
  const x = (row: Listing) => axis === "year" ? row.modelYear! : row.mileage!;
  const minX = scatter.length ? Math.min(...scatter.map(x)) : 0;
  const maxX = scatter.length ? Math.max(...scatter.map(x)) : 0;
  const minPrice = priced.length ? Math.min(...priced.map((row) => row.priceCents!)) : 0;
  const maxPrice = priced.length ? Math.max(...priced.map((row) => row.priceCents!)) : 0;
  const observed = filtered.map((row) => row.observedAt).filter((value) => Number.isFinite(Date.parse(value))).sort().at(-1);
  return (
    <section className="panel saved-charts" aria-label="Gráficos dos anúncios salvos">
      <h2>Preços dos anúncios salvos</h2>
      <p className="muted">Amostra de {filtered.length} anúncios salvos; {priced.length} com preço e {filtered.length - priced.length} sem preço. Última observação: {observed ? observedWhen(observed) : "não disponível"}. São preços pedidos nos anúncios.</p>
      <div className="saved-chart-filters">
        <label>Fonte<select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Todas</option>{unique(rows.map((row) => row.source)).map((value) => <option key={value} value={value}>{sourceNames[value as Listing["source"]]}</option>)}</select></label>
        <label>UF<select value={state} onChange={(event) => setState(event.target.value)}><option value="">Todas</option>{unique(rows.map((row) => row.state)).map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Modelo<select value={model} onChange={(event) => setModel(event.target.value)}><option value="">Todos</option>{unique(rows.map((row) => row.model)).map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      {!priced.length ? <p role="status">Nenhum preço disponível neste recorte.</p> : (
        <div className="saved-chart-grid">
          <div>
            <h3>Distribuição dos preços pedidos</h3>
            <p className="muted">Cada faixa abre os anúncios que a compõem.</p>
            {distribution.map(([start, listings]) => (
              <details className="saved-price-band" key={start}>
                <summary><span>{money(start)} a {money(start + bandSize - 1)}</span><span className="saved-price-bar" style={{ width: `${Math.max(8, listings.length / priced.length * 100)}%` }} /><strong>{listings.length}</strong></summary>
                <ul>{listings.map((row) => <li key={`${row.source}:${row.externalId}`}><Link href={listingPath(row)}>{row.title} · {money(row.priceCents!)}</Link></li>)}</ul>
              </details>
            ))}
          </div>
          <div>
            <h3>Preço × {axis === "year" ? "ano-modelo" : "quilometragem"}</h3>
            <label>Relacionar com<select value={axis} onChange={(event) => setAxis(event.target.value as typeof axis)}><option value="year">Ano-modelo</option><option value="mileage">Quilometragem</option></select></label>
            {scatter.length < 2 ? <p role="status">Amostra insuficiente: {scatter.length} anúncio com preço e {axis === "year" ? "ano" : "quilometragem"}.</p> : (
              <>
                <div className="saved-scatter" role="group" aria-label={`Preço por ${axis === "year" ? "ano-modelo" : "quilometragem"}`}>
                  {scatter.map((row) => <Link key={`${row.source}:${row.externalId}`} href={listingPath(row)} className="saved-scatter-point" style={{ left: `${8 + (maxX === minX ? 50 : (x(row) - minX) / (maxX - minX) * 84)}%`, bottom: `${8 + (maxPrice === minPrice ? 50 : (row.priceCents! - minPrice) / (maxPrice - minPrice) * 84)}%` }} aria-label={`${row.title}: ${money(row.priceCents!)}, ${axis === "year" ? row.modelYear : `${number(row.mileage!)} km`}`} title={row.title} />)}
                </div>
                <p className="muted">{axis === "year" ? `${minX} a ${maxX}` : `${number(minX)} a ${number(maxX)} km`} · {scatter.length} anúncios · {filtered.length - scatter.length} sem os dois campos. Cada ponto abre o anúncio.</p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
