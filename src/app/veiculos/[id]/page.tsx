"use client";

import { use, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  Pencil,
  Trash2,
  Columns3,
  ExternalLink,
  Expand,
  X,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import {
  Empty,
  Opportunity,
  VehicleImage,
  VehicleCard,
} from "@/components/vehicle-ui";
import {
  PriceHistory,
  PurchaseSimulator,
  usePriceHistory,
  percent,
  recordedDate,
} from "@/components/vehicle-analysis";
import {
  analyzeVehicle,
  priceRecordDate,
  OPPORTUNITY_RULES,
} from "@/lib/intelligence";
import { money, number, location, type Vehicle } from "@/lib/vehicle";
import styles from "@/components/vehicle-detail.module.css";

export default function Details({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { vehicles } = useWorkspace();
  const vehicle = vehicles.find((item) => item.id === id);
  if (!vehicle)
    return (
      <Empty
        title="Anúncio não encontrado"
        description="Este registro foi excluído ou o endereço não existe."
        action={false}
      />
    );
  return <VehicleDetails key={vehicle.id} vehicle={vehicle} />;
}

function VehicleDetails({ vehicle: v }: { vehicle: Vehicle }) {
  const { vehicles, favorite, selected, toggleCompare, reload, notify } =
    useWorkspace();
  const router = useRouter();
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const imageDialog = useRef<HTMLDialogElement>(null);
  const imageButton = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const history = usePriceHistory(v.id, v.priceCents);
  const analysis = useMemo(
    () =>
      analyzeVehicle(
        v,
        vehicles,
        history.rows.length ? { histories: { [v.id]: history.rows } } : {},
      ),
    [v, vehicles, history.rows],
  );
  const comparableIds = new Set(analysis.comparableIds);
  const comparables = vehicles.filter((vehicle) =>
    comparableIds.has(vehicle.id),
  );
  const registeredPrice = priceRecordDate(v);
  async function remove() {
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/vehicles/" + v.id, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Não foi possível excluir o anúncio.");
      await reload();
      deleteDialog.current?.close();
      notify("Anúncio excluído.");
      router.push("/veiculos");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Erro ao excluir.");
    } finally {
      setDeleting(false);
    }
  }
  return (
    <>
      <Link
        href="/veiculos"
        className="back-link"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
          try {
            const previous = sessionStorage.getItem("radar-last-catalog-url");
            if (previous && /^\/(veiculos|favoritos)(\?|$)/.test(previous)) {
              event.preventDefault();
              router.push(previous);
            }
          } catch {
            /* Browser storage is optional. */
          }
        }}
      >
        <ArrowLeft size={16} />
        Voltar ao radar
      </Link>
      <header className={styles.heading}>
        <div>
          <div className="eyebrow">{v.brand} / ANÁLISE DO VEÍCULO</div>
          <h1>{v.model}</h1>
          <p>
            {v.version || "Versão não informada"} · {v.manufactureYear}/
            {v.modelYear} · {location(v)}
          </p>
        </div>
        <div className={styles.actions}>
          <button
            className="button"
            aria-pressed={v.favorite}
            onClick={() => void favorite(v)}
          >
            <Heart size={16} fill={v.favorite ? "currentColor" : "none"} />
            {v.favorite ? "Favoritado" : "Favoritar"}
          </button>
          <Link className="button" href={"/veiculos/" + v.id + "/editar"}>
            <Pencil size={16} />
            Editar
          </Link>
          <button
            className="icon-button danger"
            aria-label="Excluir anúncio"
            onClick={() => deleteDialog.current?.showModal()}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>
      <div className={styles.hero}>
        <section className={styles.gallery} aria-label="Imagem do anúncio">
          <div className={styles.photo}>
            <VehicleImage key={v.imageUrl} vehicle={v} />
            {v.imageUrl && (
              <button
                className={styles.zoom}
                ref={imageButton}
                onClick={() => imageDialog.current?.showModal()}
                aria-label="Ampliar fotografia do veículo"
              >
                <Expand size={15} /> Ampliar foto
              </button>
            )}
          </div>
          <div className={styles.photoCaption}>
            <span>
              {v.imageUrl
                ? `Imagem cadastrada · ${v.source}`
                : "Fotografia real quando disponível no cadastro."}
            </span>
            <span>
              {v.imageUrl
                ? "Fornecida no cadastro deste anúncio"
                : "Nenhuma imagem substituta é utilizada."}
            </span>
          </div>
        </section>
        <aside className={`panel ${styles.pricePanel}`}>
          <span className="eyebrow">PREÇO ANUNCIADO</span>
          <strong className={styles.price}>{money(v.priceCents)}</strong>
          <span
            className={`${styles.badge} ${["strong", "potential"].includes(analysis.classification) ? styles.positive : ""}`}
          >
            {analysis.label}
          </span>
          <dl className={styles.primaryFacts}>
            {[
              ["Ano/modelo", v.modelYear],
              ["Quilometragem", `${number(v.mileage)} km`],
              ["Combustível", v.fuel],
              ["Câmbio", v.transmission],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "Não informado"}</dd>
              </div>
            ))}
          </dl>
          <button
            className="button primary full"
            aria-pressed={selected.includes(v.id)}
            onClick={() => toggleCompare(v.id)}
          >
            <Columns3 size={17} />
            {selected.includes(v.id)
              ? "Remover da comparação"
              : "Adicionar à comparação"}
          </button>
          {v.originalUrl && (
            <a
              className="button full"
              style={{ marginTop: 10 }}
              href={v.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir anúncio original
              <ExternalLink size={15} />
            </a>
          )}
          <div className={styles.provenance}>
            <span>
              Portal ou canal: <strong>{v.source}</strong>
              {v.sellerType && (
                <>
                  {" "}
                  · vendedor: <strong>{v.sellerType}</strong>
                </>
              )}
            </span>
            <span>
              {registeredPrice
                ? `Preço registrado em ${recordedDate(registeredPrice)}`
                : "Data de registro do preço não disponível"}
            </span>
            <span>Disponibilidade na origem não verificada.</span>
          </div>
        </aside>
      </div>
      <div className={styles.analysisGrid}>
        <section
          className={`panel ${styles.section}`}
          aria-labelledby="analysis-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <span className="eyebrow">LEITURA DA OPORTUNIDADE</span>
              <h2 id="analysis-title">O que os dados mostram.</h2>
            </div>
            <span className={styles.badge}>
              Amostra{" "}
              {analysis.confidence === "high"
                ? "suficiente"
                : analysis.confidence === "moderate"
                  ? "moderada"
                  : "insuficiente"}
            </span>
          </div>
          <dl className={styles.metrics}>
            <div>
              <dt>Mediana dos comparáveis</dt>
              <dd>
                {analysis.comparableMedianCents == null
                  ? "—"
                  : money(analysis.comparableMedianCents)}
                <small>
                  {number(analysis.comparablesCount)} anúncios equivalentes
                </small>
              </dd>
            </div>
            <div>
              <dt>Diferença da mediana</dt>
              <dd
                className={
                  (analysis.discountPercent ?? 0) > 0 ? styles.positive : ""
                }
              >
                {percent(analysis.discountPercent)}
                <small>Positivo = abaixo da mediana</small>
              </dd>
            </div>
          </dl>
          {analysis.reasons.length > 0 && (
            <ul className={styles.reasons}>
              {analysis.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {analysis.priceRangeCents && (
            <p className={styles.subtle}>
              Faixa dos comparáveis: {money(analysis.priceRangeCents.min)} a{" "}
              {money(analysis.priceRangeCents.max)}. Preços pedidos, não
              negociados.
            </p>
          )}
          {analysis.limitations.length > 0 && (
            <div className={styles.limitations}>
              <strong>Para levar em conta</strong>
              <ul>
                {analysis.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </div>
          )}
          <details className={styles.disclosure}>
            <summary>Como esta classificação é calculada</summary>
            <p>
              Usamos registros de marca, modelo, versão, ano/modelo, combustível
              e estado equivalentes. O próprio anúncio e URLs duplicadas não
              ampliam a amostra. Preços extremos são tratados antes da
              comparação.
            </p>
            <p>
              Uma classificação exige pelo menos{" "}
              {OPPORTUNITY_RULES.minComparables} comparáveis com preços
              registrados nos últimos {OPPORTUNITY_RULES.staleDays} dias.
              Potencial oportunidade exige desconto de pelo menos{" "}
              {OPPORTUNITY_RULES.potentialDiscount}% da mediana. Oportunidade
              forte exige {OPPORTUNITY_RULES.strongMinComparables} comparáveis,
              desconto de {OPPORTUNITY_RULES.strongDiscount}% e redução recente
              de {OPPORTUNITY_RULES.strongReductionPercent}% ou mais, além de
              dispersão controlada.
            </p>
            <p>
              A suficiência se refere à amostra, não à condição do veículo ou à
              segurança de uma compra. Valores muito distantes dos comparáveis
              exigem investigação.
            </p>
            <Link href="/configuracoes">Ver metodologia e configurações →</Link>
          </details>
        </section>
        <section
          className={`panel ${styles.section}`}
          aria-labelledby="reference-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <span className="eyebrow">CONTEXTO DE VALOR</span>
              <h2 id="reference-title">Referência informada</h2>
            </div>
          </div>
          {v.referenceCents ? (
            <>
              <strong className={styles.referenceAmount}>
                {money(v.referenceCents)}
              </strong>
              <Opportunity vehicle={v} full />
              <p className={styles.referenceExplanation}>
                Valor cadastrado por você. A origem, a versão e o mês desta
                referência não foram verificados pela plataforma.
              </p>
            </>
          ) : (
            <p className={styles.referenceEmpty}>
              Nenhum valor de referência foi associado a este anúncio. Você pode
              informá-lo ao editar o cadastro.
            </p>
          )}
          <div className={styles.disclosure}>
            <strong>Sobre a FIPE</strong>
            <p>
              Este cadastro não possui uma associação FIPE verificada. A
              referência manual não é tratada como FIPE e não determina a
              classificação da oportunidade.
            </p>
            <p>
              Um valor de referência não comprova o preço de negociação nem
              garante a revenda.
            </p>
          </div>
        </section>
      </div>
      <PriceHistory history={history} />
      <PurchaseSimulator
        key={v.id}
        vehicle={v}
        suggestedSaleCents={
          analysis.confidence !== "insufficient"
            ? analysis.comparableMedianCents
            : null
        }
      />
      <section
        className={`panel ${styles.section}`}
        aria-labelledby="technical-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">FICHA DO CADASTRO</span>
            <h2 id="technical-title">Informações do veículo</h2>
          </div>
        </div>
        <dl className={styles.technicalGrid}>
          {[
            ["Marca", v.brand],
            ["Modelo", v.model],
            ["Versão", v.version],
            ["Fabricação / modelo", `${v.manufactureYear} / ${v.modelYear}`],
            ["Quilometragem", `${number(v.mileage)} km`],
            ["Combustível", v.fuel],
            ["Câmbio", v.transmission],
            ["Localização", location(v)],
            ["Portal ou canal", v.source],
            ["Tipo de vendedor", v.sellerType || "Não informado"],
            ["Cadastrado em", recordedDate(v.createdAt)],
            ["Cadastro atualizado em", recordedDate(v.updatedAt)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "Não informado"}</dd>
            </div>
          ))}
        </dl>
        <details className={styles.disclosure}>
          <summary>Suas observações</summary>
          <p className={styles.notes}>
            {v.notes || "Nenhuma observação adicionada."}
          </p>
        </details>
      </section>
      <section
        className={styles.comparables}
        aria-labelledby="comparables-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">MESMO UNIVERSO DE COMPARAÇÃO</span>
            <h2 id="comparables-title">
              Anúncios comparáveis{" "}
              <span className={styles.subtle}>({comparables.length})</span>
            </h2>
          </div>
        </div>
        <p className={styles.intro}>
          Mesma marca, modelo, versão, ano/modelo, combustível e estado. A
          amostra respeita a recência do preço registrado e exclui valores
          extremos.
        </p>
        {comparables.length ? (
          <>
            <div className={styles.comparableGrid}>
              {comparables.slice(0, 6).map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
            {comparables.length > 6 && (
              <p className={styles.footnote}>
                Exibindo 6 de {number(comparables.length)} comparáveis
                utilizados na análise.
              </p>
            )}
          </>
        ) : (
          <div className={`panel ${styles.historyEmpty}`}>
            <span className={styles.editorialNumber}>—</span>
            <div>
              <h3>A referência melhora com a amostra.</h3>
              <p>
                Não há anúncios equivalentes disponíveis para este veículo.
                Novos cadastros com dados completos podem ampliar a cobertura.
              </p>
            </div>
          </div>
        )}
      </section>
      <dialog
        ref={imageDialog}
        className={styles.lightbox}
        aria-label="Fotografia ampliada do veículo"
        onClose={() => imageButton.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget)
            imageDialog.current?.close();
        }}
      >
        <div className={styles.lightboxHeader}>
          <span>
            {v.brand} {v.model}
          </span>
          <button
            className="button small"
            onClick={() => imageDialog.current?.close()}
          >
            <X size={16} />
            Fechar fotografia
          </button>
        </div>
        <div className={styles.lightboxImage}>
          <VehicleImage key={v.imageUrl} vehicle={v} />
        </div>
        <p className={styles.lightboxCaption}>
          Imagem fornecida no cadastro · {v.source}
        </p>
      </dialog>
      <dialog
        ref={deleteDialog}
        className="delete-dialog"
        aria-labelledby="delete-vehicle-title"
      >
        <h2 id="delete-vehicle-title">Excluir este anúncio?</h2>
        <p>
          {v.brand} {v.model} será removido permanentemente do catálogo, dos
          favoritos e da comparação, incluindo seu histórico de preços.
        </p>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="button"
            disabled={deleting}
            onClick={() => deleteDialog.current?.close()}
          >
            Cancelar
          </button>
          <button
            className="button destructive"
            disabled={deleting}
            onClick={() => void remove()}
          >
            {deleting ? "Excluindo…" : "Excluir anúncio"}
          </button>
        </div>
      </dialog>
    </>
  );
}
