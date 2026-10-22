"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Listing } from "@/lib/discovery";
import { sourceNames } from "@/lib/discovery";
import { listingKey } from "@/lib/listing-comparison";
import { readListingSelection, toggleListingSelection, writeListingSelection } from "@/lib/listing-selection";
import { money, number } from "@/lib/vehicle";
import { listingPath } from "@/components/listing-card";

export default function CompareSavedListings() {
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [selected, setSelected] = useState<string[]>(readListingSelection);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Listing[]>;
      })
      .then((listings) => { if (!cancelled) setRows(listings); })
      .catch(() => { if (!cancelled) setError("Não foi possível carregar os anúncios salvos."); });
    return () => { cancelled = true; };
  }, []);
  const choose = (listing: Listing) => {
    const next = toggleListingSelection(selected, listing);
    setSelected(next);
    writeListingSelection(next);
  };
  const available = rows ?? [];
  const chosen = selected.map((key) => available.find((row) => listingKey(row) === key)).filter((row): row is Listing => !!row);
  const remaining = available.filter((row) => !selected.includes(listingKey(row)));
  return (
    <div className="focus-workspace">
      <div className="page-heading">
        <div><div className="eyebrow">ANÚNCIOS SALVOS</div><h1>Comparar anúncios</h1><p className="muted">Até quatro anúncios observados. Preços são anunciados, não vendas realizadas.</p></div>
        <Link href="/salvos" className="button">Voltar aos salvos</Link>
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
      {!rows && !error && <p role="status">Carregando anúncios salvos…</p>}
      {rows && <div className="panel saved-compare-picker"><label>Adicionar anúncio à comparação
        <select value="" disabled={selected.length >= 4 || remaining.length === 0} onChange={(event) => { const row = available.find((item) => listingKey(item) === event.target.value); if (row) choose(row); }}>
          <option value="">{selected.length >= 4 ? "Limite de quatro atingido" : "Selecione um anúncio salvo"}</option>
          {remaining.map((row) => <option key={listingKey(row)} value={listingKey(row)}>{row.title} · {row.priceCents === null ? "Preço indisponível" : money(row.priceCents)}</option>)}
        </select>
      </label><span>{chosen.length}/4 na comparação</span></div>}
      {rows && chosen.length < 2 && <p className="comparison-notice" role="status">Selecione pelo menos dois anúncios salvos para comparar.</p>}
      {rows && available.length === 0 && <div className="empty-state"><h2>Nenhum anúncio salvo</h2><p>Salve anúncios nos resultados da busca para compará-los.</p><Link href="/buscar" className="button primary">Buscar carros</Link></div>}
      <div className="saved-compare-grid">
        {chosen.map((row) => (
          <section className="panel saved-compare-card" key={listingKey(row)}>
            <div className="listing-topline"><span>{sourceNames[row.source]}</span><button type="button" className="text-button" onClick={() => choose(row)}>Remover</button></div>
            <h2><Link href={listingPath(row)}>{row.title}</Link></h2>
            <dl>
              <dt>Preço anunciado</dt><dd>{row.priceCents === null ? "Não informado" : money(row.priceCents)}</dd>
              <dt>Ano-modelo</dt><dd>{row.modelYear ?? "Não informado"}</dd>
              <dt>Quilometragem</dt><dd>{row.mileage === null ? "Não informada" : `${number(row.mileage)} km`}</dd>
              <dt>Modelo e versão</dt><dd>{[row.brand, row.model, row.version].filter(Boolean).join(" · ") || "Não informados"}</dd>
              <dt>Local</dt><dd>{[row.city, row.state].filter(Boolean).join("/") || "Não informado"}</dd>
              <dt>Referência</dt><dd>{row.comparison?.status === "valid" ? `${money(row.comparison.meanCents!)} · ${row.comparison.count} comparáveis` : "Amostra insuficiente"}</dd>
            </dl>
            <a href={row.url} target="_blank" rel="noopener noreferrer" className="button small">Abrir anúncio original ↗</a>
          </section>
        ))}
      </div>
    </div>
  );
}
