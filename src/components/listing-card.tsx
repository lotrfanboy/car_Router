"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, ExternalLink, ArrowUpRight } from "lucide-react";
import { type Listing, sourceNames } from "@/lib/discovery";
import { money, number } from "@/lib/vehicle";
export type ListingOrigin = "salvos" | "comparar-anuncios";
export const listingPath = (row: Pick<Listing, "source" | "externalId">, origin?: ListingOrigin) =>
  `/anuncios/${row.source}/${encodeURIComponent(row.externalId)}${origin ? `?origem=${origin}` : ""}`;
export const observedWhen = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
export function RelativePrice({ listing }: { listing: Listing }) {
  const c = listing.comparison;
  return (
    <div className="listing-metrics">
      <strong className="listing-price">
        {listing.priceCents === null
          ? "Preço não informado"
          : money(listing.priceCents)}
      </strong>
      {c?.status === "valid" ? (
        <>
          <span className="relative-price">
            {Math.abs(c.belowPercent!).toLocaleString("pt-BR", {
              maximumFractionDigits: 1,
              minimumFractionDigits: 1,
            })}
            % {c.belowPercent! >= 0 ? "abaixo" : "acima"} da média
          </span>
          <p>
            Média dos semelhantes: <strong>{money(c.meanCents!)}</strong> ·{" "}
            {c.count} comparáveis
          </p>
          <p className="muted">
            {money(Math.abs(c.differenceCents!))}{" "}
            {c.differenceCents! >= 0 ? "abaixo" : "acima"} da referência
          </p>
        </>
      ) : (
        <p className="comparison-pending">
          Sem comparação confiável · {c?.count ?? 0} comparáveis válidos
        </p>
      )}
    </div>
  );
}
export function SaveListing({
  listing,
  onChange,
}: {
  listing: Listing;
  onChange?: (saved: boolean) => void;
}) {
  const [saved, setSaved] = useState(!!listing.saved),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  async function save() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/listings/${listing.source}/${encodeURIComponent(listing.externalId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ saved: !saved }),
        },
      );
      if (!res.ok) throw new Error();
      setSaved(!saved);
      onChange?.(!saved);
    } catch {
      setError("Não foi possível salvar. Tente novamente.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <span className="save-listing">
      <button
        className="button small"
        aria-pressed={saved}
        disabled={busy}
        onClick={() => void save()}
      >
        <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
        {busy ? "Salvando…" : saved ? "Salvo" : "Salvar"}
      </button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
export function ListingCard({
  listing,
  searchId,
  origin,
  onSavedChange,
  matchStatus,
}: {
  listing: Listing;
  searchId?: string;
  origin?: ListingOrigin;
  onSavedChange?: (saved: boolean) => void;
  matchStatus?: "confirmed" | "uncertain" | "incompatible";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const path = searchId
    ? `${listingPath(listing)}?busca=${encodeURIComponent(searchId)}`
    : listingPath(listing, origin);
  return (
    <article
      className="listing-card with-photo"
    >
      {listing.imageUrl && !imageFailed ? (
        <Link className="listing-photo" href={path} prefetch={false}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={listing.imageUrl}
            alt={listing.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        </Link>
      ) : (
        <div className="listing-photo listing-photo-unavailable" role="img" aria-label="Foto indisponível para este anúncio">
          Foto indisponível
        </div>
      )}
      <div className="listing-body">
        <div className="listing-topline">
          <span>{sourceNames[listing.source]}</span>
          <span>
            {listing.isNew ? "Novo nesta busca" : "Anúncio observado"}
          </span>
        </div>
        <h2>
          <Link href={path} prefetch={false}>{listing.title}</Link>
        </h2>
        {matchStatus && (
          <p className="muted">
            {matchStatus === "confirmed"
              ? "Correspondência confirmada"
              : matchStatus === "uncertain"
                ? "Correspondência incerta — confira os dados do anúncio"
                : "Incompatível com os filtros selecionados"}
          </p>
        )}
        {matchStatus && matchStatus !== "confirmed" && listing.reasons.length > 0 && (
          <ul aria-label="Restrições deste anúncio">
            {listing.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        )}
        <p className="listing-specs">
          {listing.version || "Versão desconhecida"}
          {listing.versionOrigin === "inferred" ? " (inferida)" : ""} ·{" "}
          {listing.modelYear ?? "Ano não informado"} ·{" "}
          {listing.mileage === null
            ? "Km não informado"
            : `${number(listing.mileage)} km`}{" "}
          · {listing.city ?? "Cidade não informada"}/{listing.state ?? "—"}
        </p>
        <RelativePrice listing={listing} />
        <div className="listing-actions">
          <Link href={path} className="text-link" prefetch={false}>
            Conferir semelhantes <ArrowUpRight size={14} />
          </Link>
          <a
            className="button small"
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Anúncio original <ExternalLink size={14} />
          </a>
          <SaveListing listing={listing} onChange={onSavedChange} />
        </div>
        <small className="listing-observed">
          Consultado em {observedWhen(listing.observedAt)} · horário de Brasília
        </small>
      </div>
    </article>
  );
}
