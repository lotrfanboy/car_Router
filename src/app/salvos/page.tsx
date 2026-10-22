"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { type Listing } from "@/lib/discovery";
import { ListingCard } from "@/components/listing-card";
import { useWorkspace } from "@/components/workspace";
import { money } from "@/lib/vehicle";
import { listingKey } from "@/lib/listing-comparison";
import { readListingSelection, reconcileListingSelection, toggleListingSelection, writeListingSelection } from "@/lib/listing-selection";
import { SavedListingCharts } from "@/components/saved-listing-charts";
export default function Page() {
  const [rows, setRows] = useState<Listing[] | null>(null),
    [error, setError] = useState(""),
    [comparison, setComparison] = useState<string[]>(readListingSelection);
  const { vehicles } = useWorkspace();
  const favorites = vehicles.filter((v) => v.favorite);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<Listing[]>;
      })
      .then((data) => {
        if (!cancelled) {
          const next = reconcileListingSelection(readListingSelection(), data);
          setRows(data);
          setComparison(next);
          writeListingSelection(next);
        }
      })
      .catch(() => {
        if (!cancelled)
          setError("Não foi possível carregar os salvos. Recarregue a página.");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="focus-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PARA AVALIAR COM CALMA</div>
          <h1>Salvos</h1>
          <p className="muted">
            Anúncios guardados, com a referência recalculada a partir das
            observações disponíveis.
          </p>
        </div>
        <Link href="/buscar" className="button primary">
          Buscar carros
        </Link>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {!rows && !error && <p role="status">Carregando salvos…</p>}
      {rows?.length === 0 && !favorites.length && (
        <div className="empty-state">
          <h2>Nenhum anúncio salvo ainda</h2>
          <p>Use Salvar nos resultados ou no detalhe de um anúncio.</p>
        </div>
      )}
      {!!rows?.length && <SavedListingCharts rows={rows} />}
      <div className="saved-listings">
        {!!rows?.length && <div className="saved-compare-controls"><span>{comparison.length}/4 anúncios selecionados</span><Link className="button" href="/comparar-anuncios">Comparar anúncios salvos</Link></div>}
        {rows?.map((row) => (
          <div key={listingKey(row)}>
            <label className="saved-compare-toggle"><input type="checkbox" checked={comparison.includes(listingKey(row))} disabled={comparison.length >= 4 && !comparison.includes(listingKey(row))} onChange={() => { const next = toggleListingSelection(comparison, row); setComparison(next); writeListingSelection(next); }} /> Comparar este anúncio</label>
            <ListingCard
              listing={row}
              origin="salvos"
              onSavedChange={(saved) => {
                if (!saved) {
                  setRows((previous) => previous?.filter((x) => listingKey(x) !== listingKey(row)) ?? []);
                  const next = comparison.filter((key) => key !== listingKey(row));
                  setComparison(next);
                  writeListingSelection(next);
                }
              }}
            />
          </div>
        ))}
      </div>
      {favorites.length > 0 && (
        <section className="panel">
          <h2>Seus favoritos do catálogo</h2>
          <p className="muted">
            Registros anteriores preservados com seus dados e históricos.
          </p>
          {favorites.map((v) => (
            <Link
              className="favorite-summary"
              href={`/veiculos/${v.id}`}
              key={v.id}
            >
              <span>
                {v.brand} {v.model} · {v.version} · {v.modelYear}
              </span>
              <strong>{money(v.priceCents)}</strong>
            </Link>
          ))}
          <Link href="/favoritos" className="text-link">
            Abrir favoritos e filtros salvos do catálogo
          </Link>
        </section>
      )}
    </div>
  );
}
