"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Columns3, ExternalLink, X } from "lucide-react";
import {
  collectionKey,
  collectionPath,
  collectionView,
  type CollectionEntry,
} from "@/lib/vehicle-collection";
import { useVehicleCollection } from "./use-vehicle-collection";
import { collectionSpecs } from "./collection-comparison-specs";
import {
  CollectionPhoto,
  CollectionHistory,
  ComparisonVisuals,
  comparisonColors,
} from "./collection-visuals";
import styles from "./saved-listings.module.css";
const tabs = ["Visão comparativa", "Ficha completa", "Históricos"];
export function SavedListingComparison() {
  const collection = useVehicleCollection();
  const [active, setActive] = useState(0),
    [differences, setDifferences] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const entries = collection.selected
    .map((key) =>
      collection.entries.find((entry) => collectionKey(entry) === key),
    )
    .filter((entry): entry is CollectionEntry => !!entry);
  const remaining = collection.entries.filter(
    (entry) => !collection.selected.includes(collectionKey(entry)),
  );
  const specs = collectionSpecs(collection.manuals).filter(
    (spec) =>
      !differences ||
      new Set(entries.map((entry) => JSON.stringify(spec.raw(entry)))).size > 1,
  );
  return (
    <div className={`${styles.workspace} focus-workspace`}>
      <header className={styles.heading}>
        <div>
          <div className="eyebrow">INFORMAÇÃO QUE MOSTRA AS DIFERENÇAS</div>
          <h1>Comparar carros</h1>
          <p>
            Seus anúncios da busca e cadastros manuais na mesma seleção. Cada
            origem mantém seus dados, referências e histórico.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/salvos" className="button">
            Seus veículos de interesse
          </Link>
          <Link href="/veiculos/novo" className="button">
            Incluir manualmente
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
          Cadastros manuais indisponíveis neste carregamento.
          <button className="button" onClick={collection.retryManuals}>
            Tentar cadastros novamente
          </button>
        </div>
      )}
      {collection.loading && (
        <p role="status">Carregando os registros da seleção…</p>
      )}
      <div className={styles.compareControls}>
        <label>
          <span>Adicionar à comparação</span>
          <select
            value=""
            disabled={collection.selected.length >= 4 || !remaining.length}
            onChange={(event) => {
              const entry = remaining.find(
                (item) => collectionKey(item) === event.target.value,
              );
              if (entry) collection.select(entry);
            }}
          >
            <option value="">
              {collection.selected.length >= 4
                ? "Quatro registros selecionados"
                : "Escolha um salvo ou cadastro manual"}
            </option>
            {remaining.map((entry) => {
              const row = collectionView(entry);
              return (
                <option key={row.key} value={row.key}>
                  {row.origin} · {row.title} ·{" "}
                  {row.modelYear ?? "ano não informado"}
                </option>
              );
            })}
          </select>
        </label>
        {collection.selected.length > 0 && (
          <button className="button" onClick={collection.clear}>
            Limpar seleção
          </button>
        )}
      </div>
      <div className={styles.listHeading}>
        <p aria-live="polite">
          {collection.selected.length} de 4 registros na comparação
        </p>
        <span>
          Carregados: {entries.filter((e) => e.kind === "listing").length} da
          busca · {entries.filter((e) => e.kind === "manual").length} manuais
        </span>
      </div>
      {collection.selected.length > entries.length && !collection.loading && (
        <p className={styles.notice}>
          Parte da seleção não pôde ser carregada. Os registros de outra origem
          continuam disponíveis; a seleção não foi substituída por dados
          fictícios.
        </p>
      )}
      {entries.length === 0 && !collection.loading && (
        <section className={styles.empty}>
          <Columns3 size={32} />
          <h2>Compare o que faz sentido para você</h2>
          <p>
            Selecione registros de qualquer origem. A inclusão manual continua
            disponível, sem precisar recadastrar uma oferta encontrada na busca.
          </p>
          <Link href="/salvos" className="button primary">
            Escolher veículos
          </Link>
        </section>
      )}
      {entries.length > 0 && (
        <>
          <div className={styles.selectedStrip}>
            {entries.map((entry, index) => {
              const row = collectionView(entry);
              return (
                <div
                  key={row.key}
                  style={{ borderColor: comparisonColors[index] }}
                >
                  <span style={{ color: comparisonColors[index] }}>
                    {index + 1} · {row.origin}
                  </span>
                  <strong>{row.model || row.title}</strong>
                  <button
                    aria-label={`Remover ${row.origin}: ${row.title} da comparação`}
                    onClick={() => collection.select(entry)}
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
          {entries.length < 2 && (
            <div className={styles.notice} role="status">
              {collection.selected.length > entries.length
                ? "Há apenas um registro disponível neste carregamento."
                : "Adicione mais um registro para comparar diferenças entre veículos."}
            </div>
          )}
          <div
            className={styles.analysisTabs}
            role="tablist"
            aria-label="Análises da comparação"
          >
            {tabs.map((label, index) => (
              <button
                key={label}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                role="tab"
                id={`comparison-tab-${index}`}
                aria-controls={`comparison-panel-${index}`}
                aria-selected={active === index}
                tabIndex={active === index ? 0 : -1}
                onClick={() => setActive(index)}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : (index +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            tabs.length) %
                          tabs.length;
                  setActive(next);
                  tabRefs.current[next]?.focus();
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`comparison-panel-${active}`}
            aria-labelledby={`comparison-tab-${active}`}
            tabIndex={0}
          >
            {active === 0 && (
              <ComparisonVisuals
                entries={entries}
                selectedCount={collection.selected.length}
              />
            )}
            {active === 1 && (
              <>
                <div className={styles.compareControls}>
                  <label className={styles.difference}>
                    <input
                      type="checkbox"
                      checked={differences}
                      disabled={entries.length < 2}
                      onChange={(event) => setDifferences(event.target.checked)}
                    />{" "}
                    Mostrar apenas diferenças
                  </label>
                </div>
                <p className={styles.footnote}>
                  Referências de portais e do catálogo manual usam bases e
                  regras próprias, identificadas em cada coluna. Não são uma
                  avaliação unificada. Dados técnicos extraídos literalmente da
                  versão são sinalizados.
                </p>
                <div
                  className={styles.compareScroll}
                  tabIndex={0}
                  role="region"
                  aria-label="Ficha comparativa. Role horizontalmente para conferir todas as colunas."
                >
                  <table
                    className={styles.compareTable}
                    style={{ minWidth: 150 + entries.length * 245 }}
                  >
                    <caption className="sr-only">
                      Ficha de {entries.length} registros, com origens
                      preservadas
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Sua seleção</th>
                        {entries.map((entry, index) => {
                          const row = collectionView(entry);
                          return (
                            <th key={row.key} scope="col">
                              <div className={styles.comparePhoto}>
                                <CollectionPhoto entry={entry} />
                              </div>
                              <span
                                className={styles.source}
                                style={{ color: comparisonColors[index] }}
                              >
                                {row.origin} · {row.source}
                              </span>
                              <Link
                                className={styles.carTitle}
                                href={collectionPath(entry, "comparar")}
                              >
                                {row.title}
                              </Link>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        "Preço e referências",
                        "O veículo",
                        "Origem e histórico",
                      ].map((group) => {
                        const rows = specs.filter(
                          (spec) => spec.group === group,
                        );
                        return rows.length > 0 ? (
                          <SpecGroup
                            key={group}
                            group={group}
                            specs={rows}
                            entries={entries}
                          />
                        ) : null;
                      })}
                      {specs.length === 0 && (
                        <tr>
                          <td colSpan={entries.length + 1}>
                            Não há diferenças nos atributos disponíveis.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Confira os detalhes</th>
                        {entries.map((entry) => {
                          const row = collectionView(entry);
                          return (
                            <td key={row.key}>
                              <Link
                                href={collectionPath(entry, "comparar")}
                                className="button"
                              >
                                Detalhe, histórico e simulação
                              </Link>
                              {row.url && (
                                <a
                                  href={row.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.detailLink}
                                >
                                  Anúncio original <ExternalLink size={14} />
                                </a>
                              )}
                              {entry.kind === "manual" && (
                                <Link
                                  href={`/veiculos/${entry.vehicle.id}/editar`}
                                  className={styles.detailLink}
                                >
                                  Editar cadastro manual
                                </Link>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
            {active === 2 && (
              <>
                {entries.map((entry) => (
                  <CollectionHistory key={collectionKey(entry)} entry={entry} />
                ))}
                <p className={styles.footnote}>
                  Editar um cadastro manual e observar um preço em um portal são
                  eventos distintos. Cada gráfico usa somente os registros da
                  respectiva entidade.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
function SpecGroup({
  group,
  specs,
  entries,
}: {
  group: string;
  specs: ReturnType<typeof collectionSpecs>;
  entries: CollectionEntry[];
}) {
  return (
    <>
      <tr className={styles.group}>
        <th colSpan={entries.length + 1} scope="colgroup">
          {group}
        </th>
      </tr>
      {specs.map((spec) => (
        <tr key={spec.label}>
          <th scope="row">{spec.label}</th>
          {entries.map((entry) => (
            <td key={collectionKey(entry)}>{spec.value(entry)}</td>
          ))}
        </tr>
      ))}
    </>
  );
}
