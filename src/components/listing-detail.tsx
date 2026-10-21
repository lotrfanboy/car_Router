"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { type Listing, sourceNames } from "@/lib/discovery";
import { money, number } from "@/lib/vehicle";
import { RelativePrice, SaveListing, observedWhen } from "./listing-card";
export function ListingDetail({
  source,
  id,
  searchId,
}: {
  source: string;
  id: string;
  searchId?: string;
}) {
  const [row, setRow] = useState<Listing | null>(null),
    [error, setError] = useState(""),
    [history, setHistory] = useState<
      { id: number; priceCents: number; observedAt: string }[] | null
    >(null),
    [historyError, setHistoryError] = useState(""),
    [busy, setBusy] = useState(false),
    [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/listings/${source}/${encodeURIComponent(id)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 404
              ? "Anúncio não encontrado."
              : "Não foi possível abrir o anúncio.",
          );
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setRow(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [source, id]);
  async function prices() {
    if (busy) return;
    setBusy(true);
    setHistoryError("");
    try {
      const r = await fetch(
        `/api/discoveries/${source}/${encodeURIComponent(id)}/prices`,
        { cache: "no-store" },
      );
      if (!r.ok) throw new Error();
      setHistory(await r.json());
    } catch {
      setHistoryError("Não foi possível carregar o histórico.");
    } finally {
      setBusy(false);
    }
  }
  const back = searchId
    ? `/buscar?busca=${encodeURIComponent(searchId)}`
    : "/buscar";
  if (error)
    return (
      <div role="alert" className="error-box">
        {error} <Link href={back}>Voltar à busca</Link>
      </div>
    );
  if (!row) return <p role="status">Carregando anúncio e semelhantes…</p>;
  const c = row.comparison!;
  return (
    <div className="focus-workspace listing-detail">
      <Link className="back-link" href={back}>
        ← Voltar aos resultados
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {sourceNames[row.source]} · PREÇO EM CONTEXTO
          </div>
          <h1>{row.title}</h1>
          <p className="muted">
            {row.version ?? "Versão desconhecida"}
            {row.versionOrigin === "inferred"
              ? " (inferida da fonte)"
              : ""} · {row.modelYear ?? "Ano não informado"} ·{" "}
            {row.mileage === null
              ? "Km não informado"
              : `${number(row.mileage)} km`}{" "}
            · {row.city ?? "Cidade não informada"}/{row.state ?? "—"}
          </p>
        </div>
      </div>
      <section className="panel listing-detail-summary">
        {row.imageUrl && !photoFailed && (
          <div className="detail-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.imageUrl}
              alt={row.title}
              referrerPolicy="no-referrer"
              onError={() => setPhotoFailed(true)}
            />
          </div>
        )}
        <div>
          <RelativePrice listing={row} />
          <p className="muted">
            Anúncio consultado em {observedWhen(row.observedAt)}.
          </p>
          <div className="listing-actions">
            <a
              className="button primary"
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir anúncio original ↗
            </a>
            <SaveListing listing={row} />
            {searchId && (
              <Link
                className="button"
                href={`/radares?busca=${encodeURIComponent(searchId)}`}
              >
                Criar alerta desta busca
              </Link>
            )}
          </div>
        </div>
      </section>
      <section className="panel">
        <h2>Como chegamos à comparação</h2>
        <p>
          {c.status === "valid"
            ? `A média aritmética usa ${c.count} anúncios semelhantes, excluindo este anúncio.`
            : "Ainda não há uma base confiável para comparar este preço."}
        </p>
        <p className="muted">
          {c.periodStart && c.periodEnd
            ? `Observações de ${observedWhen(c.periodStart)} a ${observedWhen(c.periodEnd)}.`
            : "Sem período de referência disponível."}{" "}
          Cálculo em {observedWhen(c.evaluatedAt)}.
        </p>
        <ul>
          {c.criteria.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {c.limitations.length > 0 && (
          <div className="comparison-limitations">
            <h3>Limitações desta comparação</h3>
            <ul>
              {c.limitations.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="muted">
          Preços anunciados da amostra; não são garantia de condição, lucro ou
          valor de venda.
        </p>
      </section>
      <section className="panel">
        <h2>{c.count} anúncios na referência</h2>
        {c.comparables.length ? (
          <div className="table-wrap">
            <table>
              <caption>Anúncios que sustentam o cálculo atual</caption>
              <thead>
                <tr>
                  <th>Anúncio</th>
                  <th>Preço</th>
                  <th>Ano / km</th>
                  <th>Localização</th>
                  <th>Consulta</th>
                </tr>
              </thead>
              <tbody>
                {c.comparables.map((peer) => (
                  <tr key={`${peer.source}:${peer.externalId}`}>
                    <td>
                      <a
                        href={peer.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {peer.title} ↗
                      </a>
                      <small>
                        {sourceNames[peer.source]} · {peer.version}
                        {peer.versionOrigin === "inferred" ? " (inferida)" : ""}
                      </small>
                    </td>
                    <td>{money(peer.priceCents)}</td>
                    <td>
                      {peer.modelYear} /{" "}
                      {peer.mileage === null ? "—" : number(peer.mileage)}
                    </td>
                    <td>
                      {peer.city ?? "—"}/{peer.state}
                    </td>
                    <td>{observedWhen(peer.observedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            Nenhum anúncio atende aos critérios de semelhança e recência.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Histórico de preços</h2>
        <button
          className="button"
          disabled={busy}
          onClick={() => void prices()}
        >
          {busy ? "Carregando…" : "Ver preços observados"}
        </button>
        {historyError && <p role="alert">{historyError}</p>}
        {history && (
          <ul>
            {history.map((item) => (
              <li key={item.id}>
                {observedWhen(item.observedAt)} · {money(item.priceCents)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
