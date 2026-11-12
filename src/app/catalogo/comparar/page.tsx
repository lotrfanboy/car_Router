"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { X, Plus, Columns3, ArrowUpRight, Heart } from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import {
  PageHeading,
  VehicleImage,
  Opportunity,
} from "@/components/vehicle-ui";
import { percent, recordedDate } from "@/components/vehicle-analysis";
import { analyzeVehicle, priceRecordDate } from "@/lib/intelligence";
import { type Vehicle, money, number, location } from "@/lib/vehicle";
import styles from "@/components/vehicle-detail.module.css";

type Spec = {
  label: string;
  section: string;
  raw: (vehicle: Vehicle, index: number) => unknown;
  value: (vehicle: Vehicle, index: number) => ReactNode;
};
export default function Compare() {
  const { vehicles, selected, toggleCompare, clearCompare, favorite } =
    useWorkspace();
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const rows = useMemo(
    () =>
      selected
        .map((id) => vehicles.find((v) => v.id === id))
        .filter((v): v is Vehicle => !!v),
    [selected, vehicles],
  );
  const analyses = useMemo(
    () => rows.map((v) => analyzeVehicle(v, vehicles)),
    [rows, vehicles],
  );
  const minimumPrice = Math.min(...rows.map((v) => v.priceCents));
  const differingPrices = new Set(rows.map((v) => v.priceCents)).size > 1;
  const specs: Spec[] = [
    {
      section: "Valores & referências",
      label: "Preço anunciado",
      raw: (v) => v.priceCents,
      value: (v) => (
        <>
          <strong>{money(v.priceCents)}</strong>
          {differingPrices && v.priceCents === minimumPrice && (
            <small className={styles.positive}>Menor preço desta seleção</small>
          )}
        </>
      ),
    },
    {
      section: "Valores & referências",
      label: "Referência informada",
      raw: (v) => v.referenceCents,
      value: (v) => (
        <>
          {v.referenceCents ? money(v.referenceCents) : "Não informada"}
          <small>Valor manual · não é FIPE verificada</small>
        </>
      ),
    },
    {
      section: "Valores & referências",
      label: "Diferença para a referência",
      raw: (v) => (v.referenceCents ? v.priceCents / v.referenceCents : null),
      value: (v) => <Opportunity vehicle={v} full />,
    },
    {
      section: "Valores & referências",
      label: "Classificação",
      raw: (_, i) => analyses[i].classification,
      value: (_, i) => (
        <span
          className={`${styles.badge} ${["strong", "potential"].includes(analyses[i].classification) ? styles.positive : ""}`}
        >
          {analyses[i].label}
        </span>
      ),
    },
    {
      section: "Valores & referências",
      label: "Mediana dos comparáveis",
      raw: (_, i) => [
        analyses[i].comparableMedianCents,
        analyses[i].comparablesCount,
      ],
      value: (_, i) => (
        <>
          {analyses[i].comparableMedianCents === null
            ? "—"
            : money(analyses[i].comparableMedianCents)}
          <small>{analyses[i].comparablesCount} anúncios equivalentes</small>
        </>
      ),
    },
    {
      section: "Valores & referências",
      label: "Diferença da mediana",
      raw: (_, i) => analyses[i].discountPercent,
      value: (_, i) => (
        <>
          {percent(analyses[i].discountPercent)}
          <small>Positivo = abaixo da mediana</small>
        </>
      ),
    },
    {
      section: "O veículo",
      label: "Marca / modelo",
      raw: (v) => [v.brand, v.model],
      value: (v) => `${v.brand} ${v.model}`,
    },
    {
      section: "O veículo",
      label: "Fabricação / modelo",
      raw: (v) => [v.manufactureYear, v.modelYear],
      value: (v) => `${v.manufactureYear} / ${v.modelYear}`,
    },
    {
      section: "O veículo",
      label: "Versão",
      raw: (v) => v.version,
      value: (v) => v.version || "Não informada",
    },
    {
      section: "O veículo",
      label: "Quilometragem",
      raw: (v) => v.mileage,
      value: (v) => `${number(v.mileage)} km`,
    },
    {
      section: "O veículo",
      label: "Combustível",
      raw: (v) => v.fuel,
      value: (v) => v.fuel || "Não informado",
    },
    {
      section: "O veículo",
      label: "Câmbio",
      raw: (v) => v.transmission,
      value: (v) => v.transmission || "Não informado",
    },
    {
      section: "O veículo",
      label: "Localização",
      raw: (v) => [v.city, v.state],
      value: location,
    },
    {
      section: "Origem & registros",
      label: "Origem",
      raw: (v) => v.source,
      value: (v) => v.source,
    },
    {
      section: "Origem & registros",
      label: "Cadastrado em",
      raw: (v) => v.createdAt,
      value: (v) => recordedDate(v.createdAt),
    },
    {
      section: "Origem & registros",
      label: "Último registro de preço",
      raw: (v) => priceRecordDate(v),
      value: (v) => {
        const date = priceRecordDate(v);
        return date ? recordedDate(date) : "Não informado";
      },
    },
    {
      section: "Origem & registros",
      label: "Redução registrada recente",
      raw: (_, i) => analyses[i].reduction?.amountCents ?? null,
      value: (_, i) =>
        analyses[i].reduction ? (
          <>
            <span className={styles.positive}>
              − {money(analyses[i].reduction?.amountCents)}
            </span>
            <small>
              {percent(analyses[i].reduction?.percent)} ·{" "}
              {recordedDate(analyses[i].reduction!.observedAt)}
            </small>
          </>
        ) : (
          "Não registrada"
        ),
    },
    {
      section: "Origem & registros",
      label: "Últimos preços preservados",
      raw: (v) => (v.priceHistory || []).map((row) => row.priceCents),
      value: (v) => (
        <>
          {v.priceHistory?.length
            ? v.priceHistory.map((row) => money(row.priceCents)).join(" → ")
            : "Histórico não disponível"}
          <small>
            <Link href={`/veiculos/${v.id}`}>Abrir histórico completo →</Link>
          </small>
        </>
      ),
    },
  ];
  const visibleSpecs = specs.filter(
    (spec) =>
      !differencesOnly ||
      new Set(rows.map((v, i) => JSON.stringify(spec.raw(v, i)))).size > 1,
  );
  return (
    <>
      <PageHeading
        eyebrow="DECISÃO COM CONTEXTO"
        title="Comparador"
        description="Até quatro veículos. A mesma régua para enxergar as diferenças."
      >
        {rows.length > 0 && (
          <button className="button" onClick={clearCompare}>
            Limpar seleção
          </button>
        )}
      </PageHeading>
      {rows.length === 1 && (
        <div className="comparison-notice">
          <Columns3 size={22} />
          <div>
            <strong>Selecione mais um veículo</strong>
            <p>Adicione outro anúncio para comparar os detalhes lado a lado.</p>
          </div>
        </div>
      )}
      <div className="compare-picker">
        <label>
          Adicionar veículo
          <select
            aria-label="Adicionar veículo à comparação"
            value=""
            disabled={rows.length >= 4}
            onChange={(event) => {
              if (event.target.value) toggleCompare(event.target.value);
            }}
          >
            <option value="">
              {rows.length >= 4
                ? "Limite de 4 veículos atingido"
                : "Selecione um veículo cadastrado"}
            </option>
            {vehicles
              .filter((v) => !selected.includes(v.id))
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.brand} {v.model} · {v.modelYear} · {money(v.priceCents)}
                </option>
              ))}
          </select>
        </label>
        <Link href="/veiculos" className="button">
          <Plus size={16} />
          Selecionar no radar
        </Link>
      </div>
      {rows.length ? (
        <>
          <div className={styles.compareToolbar}>
            <div>
              <span className={styles.compareCount}>
                {String(rows.length).padStart(2, "0")}
              </span>
              <span className={styles.subtle}>de 4 veículos selecionados</span>
            </div>
            <label className={styles.differencesLabel}>
              <input
                type="checkbox"
                checked={differencesOnly}
                onChange={(event) => setDifferencesOnly(event.target.checked)}
              />
              Mostrar apenas diferenças
            </label>
          </div>
          <div
            className={`${styles.compareScroll} comparison-table`}
            tabIndex={0}
            role="region"
            aria-label="Comparação dos veículos. Role horizontalmente para ver todas as colunas."
          >
            <table
              className={styles.compareTable}
              style={{ minWidth: 175 + rows.length * 220 }}
            >
              <caption className={styles.srOnly}>
                Comparativo de {rows.length} veículos selecionados
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="eyebrow">SUA SELEÇÃO</span>
                    <span className={styles.compareCorner}>
                      Preços anunciados.
                      <br />
                      Compare também a condição e a documentação.
                    </span>
                  </th>
                  {rows.map((v) => (
                    <th key={v.id} scope="col">
                      <div className={styles.comparePhoto}>
                        <VehicleImage key={v.imageUrl} vehicle={v} />
                        <button
                          aria-label={`Remover ${v.model} da comparação`}
                          onClick={() => toggleCompare(v.id)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <span className="eyebrow">{v.brand}</span>
                      <Link href={`/veiculos/${v.id}`}>{v.model}</Link>
                      <p>{v.version || "Versão não informada"}</p>
                      <button
                        className="button small"
                        aria-pressed={v.favorite}
                        onClick={() => void favorite(v)}
                      >
                        <Heart
                          size={14}
                          fill={v.favorite ? "currentColor" : "none"}
                        />
                        {v.favorite ? "Favoritado" : "Favoritar"}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleSpecs.length ? (
                  [
                    "Valores & referências",
                    "O veículo",
                    "Origem & registros",
                  ].map((section) => {
                    const sectionSpecs = visibleSpecs.filter(
                      (spec) => spec.section === section,
                    );
                    return sectionSpecs.length > 0 ? (
                      <SpecSection
                        key={section}
                        section={section}
                        specs={sectionSpecs}
                        rows={rows}
                      />
                    ) : null;
                  })
                ) : (
                  <tr>
                    <td colSpan={rows.length + 1}>
                      {rows.length < 2
                        ? "Adicione outro veículo para identificar diferenças."
                        : "Não há diferenças nos atributos disponíveis desta seleção."}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Confira na origem</th>
                  {rows.map((v) => (
                    <td key={v.id}>
                      {v.originalUrl ? (
                        <a
                          className="button small"
                          href={v.originalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver anúncio <ArrowUpRight size={14} />
                        </a>
                      ) : (
                        <span className={styles.subtle}>
                          Link não informado
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className={styles.compareNote}>
            <span className={styles.editorialNumber}>↗</span>
            <p>
              O menor preço não determina a melhor compra. Referências
              informadas, comparáveis e histórico descrevem somente a amostra
              cadastrada. Verifique disponibilidade, condição, documentação e
              custos antes de negociar.
            </p>
          </div>
        </>
      ) : (
        <section className={`panel ${styles.compareEmpty}`}>
          <div className={styles.compareEmptyVisual} aria-hidden="true">
            {["01", "02", "03", "04"].map((value) => (
              <span key={value}>{value}</span>
            ))}
          </div>
          <span className="eyebrow">SUA SELEÇÃO COMEÇA NO RADAR</span>
          <h2>
            As diferenças ficam mais claras
            <br />
            quando estão lado a lado.
          </h2>
          <p>
            Reúna preços, referências informadas, quilometragem e históricos em
            uma única análise. Selecione seus veículos no campo acima ou no
            radar.
          </p>
          <Link className="button primary" href="/veiculos">
            Explorar veículos <ArrowUpRight size={16} />
          </Link>
        </section>
      )}
    </>
  );
}
function SpecSection({
  section,
  specs,
  rows,
}: {
  section: string;
  specs: Spec[];
  rows: Vehicle[];
}) {
  return (
    <>
      <tr className={styles.compareSection}>
        <th scope="colgroup" colSpan={rows.length + 1}>
          {section}
        </th>
      </tr>
      {specs.map((spec) => (
        <tr key={spec.label}>
          <th scope="row">{spec.label}</th>
          {rows.map((v, index) => (
            <td key={v.id}>{spec.value(v, index)}</td>
          ))}
        </tr>
      ))}
    </>
  );
}
