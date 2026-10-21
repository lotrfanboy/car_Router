"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { type Listing } from "@/lib/discovery";
import { ListingCard } from "@/components/listing-card";
import { useWorkspace } from "@/components/workspace";
import { money } from "@/lib/vehicle";
export default function Page() {
  const [rows, setRows] = useState<Listing[] | null>(null),
    [error, setError] = useState("");
  const { vehicles } = useWorkspace();
  const favorites = vehicles.filter((v) => v.favorite);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setRows(data);
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
      <div className="saved-listings">
        {rows?.map((row) => (
          <ListingCard
            key={`${row.source}:${row.externalId}`}
            listing={row}
            onSavedChange={(saved) => {
              if (!saved)
                setRows(
                  (previous) =>
                    previous?.filter(
                      (x) =>
                        x.source !== row.source ||
                        x.externalId !== row.externalId,
                    ) ?? [],
                );
            }}
          />
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
