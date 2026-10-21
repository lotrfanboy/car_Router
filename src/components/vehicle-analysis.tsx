"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { money, type Vehicle, type PriceObservation } from "@/lib/vehicle";
import { simulatePurchase } from "@/lib/intelligence";
import styles from "./vehicle-detail.module.css";

export function recordedDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
export function percent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function usePriceHistory(vehicleId: string, priceCents: number) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    rows: PriceObservation[];
    error: string;
  }>({ key: "", rows: [], error: "" });
  const key = `${vehicleId}:${priceCents}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/vehicles/${encodeURIComponent(vehicleId)}/prices`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok)
          throw new Error("Não foi possível carregar o histórico de preços.");
        const data: unknown = await response.json();
        if (!Array.isArray(data))
          throw new Error("O histórico retornou um formato inválido.");
        const rows = data
          .filter(
            (item): item is PriceObservation =>
              item &&
              Number.isSafeInteger(item.priceCents) &&
              item.priceCents > 0 &&
              typeof item.observedAt === "string" &&
              Number.isFinite(Date.parse(item.observedAt)),
          )
          .sort(
            (a, b) =>
              Date.parse(a.observedAt) - Date.parse(b.observedAt) ||
              (a.id ?? 0) - (b.id ?? 0),
          );
        if (!controller.signal.aborted) setState({ key, rows, error: "" });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            key,
            rows: [],
            error:
              error instanceof Error
                ? error.message
                : "Falha ao carregar o histórico.",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [key, vehicleId]);
  return {
    rows: state.key === key ? state.rows : [],
    loading: state.key !== key,
    error: state.key === key ? state.error : "",
    retry: () => setAttempt((value) => value + 1),
  };
}

export function PriceHistory({
  history,
}: {
  history: ReturnType<typeof usePriceHistory>;
}) {
  const rows = history.rows;
  const min = rows.length ? Math.min(...rows.map((row) => row.priceCents)) : 0;
  const max = rows.length ? Math.max(...rows.map((row) => row.priceCents)) : 0;
  const range = Math.max(max - min, max * 0.05, 1);
  const from = rows.length ? Date.parse(rows[0].observedAt) : 0;
  const duration = rows.length
    ? Math.max(Date.parse(rows[rows.length - 1].observedAt) - from, 1)
    : 1;
  const points = rows.map((row) => ({
    x: 24 + ((Date.parse(row.observedAt) - from) / duration) * 752,
    y: 155 - ((row.priceCents - min) / range) * 115,
    row,
  }));
  return (
    <section
      className={`panel ${styles.section}`}
      aria-labelledby="price-history-title"
    >
      <div className={styles.sectionHeading}>
        <div>
          <span className="eyebrow">REGISTROS PRESERVADOS</span>
          <h2 id="price-history-title">Trajetória do preço</h2>
        </div>
        <span className={styles.subtle}>
          {rows.length > 0
            ? `${rows.length} registros`
            : "Histórico do cadastro"}
        </span>
      </div>
      {history.loading ? (
        <div className={styles.historyLoading} role="status">
          Carregando histórico de preços…
        </div>
      ) : history.error ? (
        <div className={styles.historyError} role="alert">
          <p>{history.error}</p>
          <button className="button small" onClick={history.retry}>
            <RefreshCw size={15} /> Tentar novamente
          </button>
        </div>
      ) : rows.length < 2 ? (
        <div className={styles.historyEmpty}>
          <span className={styles.editorialNumber}>01 →</span>
          <div>
            <h3>O próximo registro conta mais uma parte.</h3>
            <p>
              {rows.length
                ? `Primeiro preço cadastrado: ${money(rows[0].priceCents)}, em ${recordedDate(rows[0].observedAt)}.`
                : "Não há registros de preço disponíveis para este anúncio."}{" "}
              Ao editar o preço, o valor anterior permanece no histórico.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.chart}>
            <div className={styles.chartRange}>
              <span>{money(max)}</span>
              <span>{money(min)}</span>
            </div>
            <svg
              viewBox="0 0 800 185"
              role="img"
              aria-label={`Preço cadastrado de ${money(rows[0].priceCents)} a ${money(rows[rows.length - 1].priceCents)}. Valores e datas disponíveis na tabela.`}
            >
              <path
                d="M24 40H776 M24 98H776 M24 155H776"
                className={styles.chartGuide}
              />
              <polyline
                points={points
                  .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
                  .join(" ")}
                className={styles.chartLine}
              />
              {points.map(({ x, y, row }, index) => (
                <circle
                  key={row.id ?? index}
                  cx={x}
                  cy={y}
                  r="4"
                  className={styles.chartDot}
                >
                  <title>
                    {recordedDate(row.observedAt)}: {money(row.priceCents)}
                  </title>
                </circle>
              ))}
            </svg>
          </div>
          <div className={styles.chartDates}>
            <span>{recordedDate(rows[0].observedAt)}</span>
            <span>{recordedDate(rows[rows.length - 1].observedAt)}</span>
          </div>
          <details className={styles.disclosure}>
            <summary>Ver todos os registros de preço</summary>
            <div className="table-scroll">
              <table>
                <caption className={styles.srOnly}>
                  Registros de preço do veículo
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Data do registro</th>
                    <th scope="col">Preço anunciado</th>
                    <th scope="col">Alteração</th>
                    <th scope="col">Origem do registro</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const change = index
                      ? row.priceCents - rows[index - 1].priceCents
                      : null;
                    return (
                      <tr key={row.id ?? index}>
                        <td>{recordedDate(row.observedAt)}</td>
                        <td>{money(row.priceCents)}</td>
                        <td
                          className={
                            change !== null && change < 0 ? styles.positive : ""
                          }
                        >
                          {change === null
                            ? "Primeiro registro"
                            : change === 0
                              ? "Sem alteração"
                              : `${change > 0 ? "+" : "−"} ${money(Math.abs(change))}`}
                        </td>
                        <td>
                          {row.reason === "created"
                            ? "Cadastro inicial"
                            : row.reason === "edited"
                              ? "Edição do cadastro"
                              : "Registro preservado"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <p className={styles.footnote}>
        O histórico reflete preços registrados neste catálogo. Não comprova
        tempo em estoque, disponibilidade atual ou venda do veículo.
      </p>
    </section>
  );
}

type SimulationValues = {
  purchasePrice: string;
  salePrice: string;
  preparation: string;
  transport: string;
  documentation: string;
  taxes: string;
  otherCosts: string;
  targetMargin: string;
};
const simulationFields: [keyof SimulationValues, string][] = [
  ["purchasePrice", "Compra hipotética"],
  ["salePrice", "Venda estimada"],
  ["preparation", "Preparação"],
  ["transport", "Transporte"],
  ["documentation", "Documentação"],
  ["taxes", "Tributos estimados"],
  ["otherCosts", "Outros custos"],
  ["targetMargin", "Margem-alvo sobre a venda (%)"],
];
export function PurchaseSimulator({
  vehicle,
  suggestedSaleCents,
}: {
  vehicle: Vehicle;
  suggestedSaleCents: number | null;
}) {
  const [values, setValues] = useState<SimulationValues>(() => ({
    purchasePrice: String(vehicle.priceCents / 100),
    salePrice:
      suggestedSaleCents == null ? "" : String(suggestedSaleCents / 100),
    preparation: "0",
    transport: "0",
    documentation: "0",
    taxes: "0",
    otherCosts: "0",
    targetMargin: "10",
  }));
  const amount = (field: keyof SimulationValues) =>
    values[field].trim() === "" ? NaN : Math.round(Number(values[field]) * 100);
  const result = simulatePurchase({
    purchasePriceCents: amount("purchasePrice"),
    salePriceCents: amount("salePrice"),
    preparationCents: amount("preparation"),
    transportCents: amount("transport"),
    documentationCents: amount("documentation"),
    taxesCents: amount("taxes"),
    otherCostsCents: amount("otherCosts"),
    targetMargin:
      values.targetMargin === "" ? NaN : Number(values.targetMargin),
  });
  const valid =
    result.valid &&
    amount("salePrice") > 0 &&
    simulationFields.every(
      ([key]) =>
        Number(values[key]) <= (key === "targetMargin" ? 99.99 : 20000000),
    );
  return (
    <section
      className={`panel ${styles.section}`}
      aria-labelledby="simulation-title"
    >
      <div className={styles.sectionHeading}>
        <div>
          <span className="eyebrow">PLANEJAMENTO FINANCEIRO</span>
          <h2 id="simulation-title">Simule antes de decidir.</h2>
        </div>
        <span className={styles.badge}>Cenário hipotético</span>
      </div>
      <p className={styles.intro}>
        Ajuste a compra, a venda e os custos do seu cenário.{" "}
        {suggestedSaleCents != null
          ? "A hipótese inicial usa a mediana dos comparáveis com amostra suficiente. São preços anunciados, não vendas realizadas."
          : "Não há base comparável suficiente para sugerir um preço. Informe sua hipótese de venda."}{" "}
        Não há garantia de retorno.
      </p>
      <div className={styles.simulationLayout}>
        <form
          className={styles.simulationForm}
          onSubmit={(event) => event.preventDefault()}
        >
          {simulationFields.map(([field, label]) => (
            <label key={field} htmlFor={`sim-${field}`}>
              {label}
              {field !== "targetMargin" ? " (R$)" : ""}
              <input
                id={`sim-${field}`}
                name={field}
                type="number"
                inputMode="decimal"
                min="0"
                max={field === "targetMargin" ? "99.99" : "20000000"}
                step="0.01"
                required
                value={values[field]}
                aria-invalid={
                  values[field] !== "" &&
                  (!Number.isFinite(Number(values[field])) ||
                    Number(values[field]) < 0 ||
                    Number(values[field]) >
                      (field === "targetMargin" ? 99.99 : 20000000))
                }
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </form>
        <div
          className={styles.simulationOutput}
          aria-live="polite"
          aria-atomic="true"
        >
          {valid ? (
            <>
              <span className="eyebrow">RESULTADO BRUTO ESTIMADO</span>
              <strong
                className={`${styles.simulationResult} ${(result.resultCents ?? 0) >= 0 ? styles.positive : styles.negative}`}
                data-simulation-result
              >
                {money(result.resultCents)}
              </strong>
              <dl className={styles.simulationTotals}>
                <div>
                  <dt>Capital necessário</dt>
                  <dd>{money(result.capitalCents)}</dd>
                </div>
                <div>
                  <dt>Margem sobre a venda</dt>
                  <dd>{percent(result.margin)}</dd>
                </div>
                <div>
                  <dt>Compra máxima para a margem-alvo</dt>
                  <dd>{money(result.maxPurchasePriceCents)}</dd>
                </div>
              </dl>
              {(result.maxPurchasePriceCents ?? 0) < 0 && (
                <p className={styles.footnote}>
                  Os custos superam o valor disponível para compra nesta
                  margem-alvo.
                </p>
              )}
              <div className={styles.sensitivity}>
                <h3>Sensibilidade à venda</h3>
                <table>
                  <caption className={styles.srOnly}>
                    Resultado estimado com variações de cinco por cento na venda
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Cenário</th>
                      <th scope="col">Venda</th>
                      <th scope="col">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sensitivity
                      .filter((scenario) => Math.abs(scenario.change) <= 5)
                      .map((scenario) => (
                        <tr key={scenario.change}>
                          <th scope="row">
                            {scenario.change === 0
                              ? "Informado"
                              : `${scenario.change > 0 ? "+" : ""}${scenario.change}%`}
                          </th>
                          <td>{money(scenario.salePriceCents)}</td>
                          <td
                            className={
                              scenario.resultCents < 0 ? styles.negative : ""
                            }
                          >
                            {money(scenario.resultCents)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.footnote}>
                Resultado = venda − compra − custos informados. Inclua os custos
                aplicáveis ao seu caso.
              </p>
            </>
          ) : (
            <div className={styles.simulationPrompt}>
              <span className="eyebrow">SEU CENÁRIO</span>
              <h3>
                {amount("salePrice") > 0
                  ? "Revise os valores do cenário."
                  : "Defina a hipótese de venda."}
              </h3>
              <p>
                Informe valores válidos, uma venda maior que zero e uma
                margem-alvo entre 0% e 99,99%.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
