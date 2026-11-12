"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, Columns3, Plus, Search } from "lucide-react";
import {
  collectionKey,
  collectionView,
  type CollectionEntry,
} from "@/lib/vehicle-collection";
import { ListingCard } from "./listing-card";
import { VehicleCard } from "./vehicle-ui";
import { useVehicleCollection } from "./use-vehicle-collection";
import styles from "./saved-listings.module.css";
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function SavedListingsWorkspace() {
  const collection = useVehicleCollection();
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("all");
  const [sort, setSort] = useState("recent");
  const shown = useMemo(
    () =>
      collection.entries
        .filter((entry) => {
          const row = collectionView(entry);
          const haystack = normalize(
            [row.title, row.city, row.state, row.source].join(" "),
          );
          return (
            (origin === "all" || entry.kind === origin) &&
            normalize(query)
              .trim()
              .split(/\s+/)
              .every((term) => haystack.includes(term))
          );
        })
        .sort((a, b) => {
          const av = collectionView(a),
            bv = collectionView(b);
          if (sort === "recent")
            return (
              (Date.parse(bv.observedAt ?? "") || 0) -
              (Date.parse(av.observedAt ?? "") || 0)
            );
          if (av.priceCents === null) return bv.priceCents === null ? 0 : 1;
          if (bv.priceCents === null) return -1;
          return sort === "price"
            ? av.priceCents - bv.priceCents
            : bv.priceCents - av.priceCents;
        }),
    [collection.entries, origin, query, sort],
  );
  return (
    <div className={`${styles.workspace} focus-workspace`}>
      <header className={styles.heading}>
        <div>
          <div className="eyebrow">ENCONTRE. ORGANIZE. COMPARE.</div>
          <h1>Seus veículos de interesse</h1>
          <p>
            Anúncios salvos da busca e cadastros manuais, com a origem e o
            histórico de cada registro preservados.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/buscar" className="button">
            <Search size={16} /> Buscar carros
          </Link>
          <Link href="/veiculos/novo" className="button primary">
            <Plus size={16} /> Incluir manualmente
          </Link>
        </div>
      </header>
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
          Não foi possível carregar os cadastros manuais.
          <button className="button" onClick={collection.retryManuals}>
            Tentar cadastros novamente
          </button>
        </div>
      )}
      {collection.loading && <p role="status">Carregando seus registros…</p>}
      <div className={styles.originTabs} aria-label="Origem dos registros">
        {[
          ["all", "Todos", collection.entries.length],
          ["listing", "Salvos da busca", collection.listings?.length ?? "—"],
          [
            "manual",
            "Cadastros manuais",
            collection.manualError || collection.manualLoading
              ? "—"
              : collection.manuals.length,
          ],
        ].map(([key, label, count]) => (
          <button
            key={key}
            className={origin === key ? styles.originActive : ""}
            aria-pressed={origin === key}
            onClick={() => setOrigin(String(key))}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span>Encontrar nos seus veículos</span>
          <input
            type="search"
            placeholder="Modelo, cidade ou fonte"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Ordenar por</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="recent">Preço observado recentemente</option>
            <option value="price">Menor preço</option>
            <option value="price-desc">Maior preço</option>
          </select>
        </label>
      </div>
      <div className={styles.catalogLinks}>
        <Link href="/veiculos">Catálogo manual e filtros avançados</Link>
        <Link href="/mercado">Análises dos cadastros manuais</Link>
        <Link href="/visao-geral">Visão geral do seu espaço</Link>
      </div>
      <div className={styles.listHeading}>
        <p aria-live="polite">
          {shown.length} de {collection.entries.length} registros
        </p>
        <span>Até quatro na mesma comparação, de qualquer origem</span>
      </div>
      {!shown.length && !collection.loading && (
        <section className={styles.empty}>
          <Bookmark size={32} aria-hidden="true" />
          <h2>
            {collection.entries.length
              ? "Nenhum registro neste recorte"
              : "Suas escolhas começam aqui"}
          </h2>
          <p>
            {collection.entries.length
              ? "Os outros registros continuam preservados. Ajuste a busca ou a origem."
              : "Salve anúncios encontrados nos portais ou inclua um veículo manualmente. Não é preciso cadastrar de novo uma oferta da busca."}
          </p>
          <button
            className="button"
            onClick={() => {
              setQuery("");
              setOrigin("all");
            }}
          >
            Mostrar todos
          </button>
          <Link href="/veiculos/novo" className="button primary">
            Incluir manualmente
          </Link>
        </section>
      )}
      <div className={styles.savedGrid}>
        {shown.map((entry) => (
          <CollectionCard
            key={collectionKey(entry)}
            entry={entry}
            selected={collection.selected.includes(collectionKey(entry))}
            disabled={
              collection.selected.length >= 4 &&
              !collection.selected.includes(collectionKey(entry))
            }
            select={() => collection.select(entry)}
            unsaved={() => {
              if (entry.kind === "listing")
                collection.removeListing(entry.listing);
            }}
          />
        ))}
      </div>
      <p className={styles.footnote}>
        São registros de interesse, não uma contagem de carros únicos. Um
        cadastro manual e um anúncio de portal podem descrever o mesmo carro;
        não são mesclados sem confirmação.
      </p>
      {collection.selected.length > 0 && (
        <aside className={styles.selection} aria-label="Seleção para comparar">
          <Columns3 size={20} />
          <strong>{collection.selected.length} de 4 selecionados</strong>
          <button className="button" onClick={collection.clear}>
            Limpar seleção
          </button>
          <Link href="/comparar" className="button primary">
            Comparar seleção
          </Link>
        </aside>
      )}
    </div>
  );
}
function CollectionCard({
  entry,
  selected,
  disabled,
  select,
  unsaved,
}: {
  entry: CollectionEntry;
  selected: boolean;
  disabled: boolean;
  select: () => void;
  unsaved: () => void;
}) {
  const row = collectionView(entry);
  return (
    <section className={styles.savedCard}>
      <label className={styles.selectRow}>
        <input
          type="checkbox"
          aria-label={`Comparar ${row.origin}: ${row.title}`}
          checked={selected}
          disabled={disabled}
          onChange={select}
        />
        <span
          className={
            entry.kind === "manual" ? styles.manualBadge : styles.listingBadge
          }
        >
          {row.origin}
        </span>
      </label>
      {entry.kind === "manual" ? (
        <VehicleCard
          vehicle={entry.vehicle}
          showCompare={false}
          origin="salvos"
        />
      ) : (
        <ListingCard
          listing={entry.listing}
          origin="salvos"
          onSavedChange={(saved) => {
            if (!saved) unsaved();
          }}
        />
      )}
    </section>
  );
}
