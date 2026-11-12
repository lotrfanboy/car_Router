"use client";
import { useId, useState } from "react";
import { money } from "@/lib/vehicle";
import { moneyInput, parseMoneyInput } from "@/lib/manual-form-values";
import { simulateFinancing } from "@/lib/financing";
import styles from "./vehicle-detail.module.css";
export function FinancingSimulator({ priceCents }: { priceCents: number }) {
  const id = useId(),
    [price, setPrice] = useState(moneyInput(priceCents)),
    [down, setDown] = useState("0,00"),
    [months, setMonths] = useState("36"),
    [rate, setRate] = useState("");
  const monthlyRate =
    rate.trim() && /^\d+(?:[.,]\d{1,4})?$/.test(rate)
      ? Number(rate.replace(",", "."))
      : NaN;
  const result = simulateFinancing({
    priceCents: parseMoneyInput(price),
    downPaymentCents: parseMoneyInput(down),
    months: Number(months),
    monthlyRatePercent: monthlyRate,
  });
  function amount(label: string, value: string, set: (s: string) => void) {
    return (
      <label>
        {label}
        <input
          aria-label={label}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          maxLength={24}
          value={value}
          onChange={(e) => {
            if (/^[0-9.,\s]*$/.test(e.target.value)) set(e.target.value);
          }}
          onBlur={() => {
            const n = parseMoneyInput(value);
            if (Number.isFinite(n)) set(moneyInput(n));
          }}
        />
      </label>
    );
  }
  return (
    <section
      className={`panel ${styles.section}`}
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.sectionHeading}>
        <div>
          <span className="eyebrow">PLANEJAR A COMPRA</span>
          <h2 id={`${id}-title`}>Quanto fica no seu cenário?</h2>
        </div>
        <span className={styles.badge}>Simulação de financiamento</span>
      </div>
      <p className={styles.intro}>
        Use a entrada, o prazo e a taxa mensal da sua hipótese ou proposta.
        Parcelas fixas pelo sistema Price. Não é uma oferta de crédito; a taxa
        não é consultada em bancos.
      </p>
      <div className={styles.simulationLayout}>
        <form
          className={styles.simulationForm}
          onSubmit={(e) => e.preventDefault()}
        >
          {amount("Preço de compra (R$)", price, setPrice)}
          {amount("Entrada (R$)", down, setDown)}
          <label>
            Prazo em meses
            <select
              aria-label="Prazo em meses"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            >
              {[12, 18, 24, 36, 48, 60, 72, 84, 96, 120].map((n) => (
                <option key={n} value={n}>
                  {n} meses
                </option>
              ))}
            </select>
          </label>
          <label>
            Taxa de juros mensal (%)
            <input
              aria-label="Taxa de juros mensal (%)"
              type="text"
              inputMode="decimal"
              maxLength={7}
              value={rate}
              placeholder="Informe a taxa mensal"
              onChange={(e) => {
                if (/^[0-9.,]*$/.test(e.target.value)) setRate(e.target.value);
              }}
            />
          </label>
        </form>
        <div
          className={styles.simulationOutput}
          aria-live="polite"
          aria-atomic="true"
        >
          {result ? (
            <>
              <span className="eyebrow">PARCELA ESTIMADA</span>
              <strong className={styles.simulationResult}>
                {money(result.paymentCents)}
              </strong>
              <dl className={styles.simulationTotals}>
                <div>
                  <dt>Valor financiado</dt>
                  <dd>{money(result.principalCents)}</dd>
                </div>
                {result.lastPaymentCents !== result.paymentCents && (
                  <div>
                    <dt>Última parcela ajustada</dt>
                    <dd>{money(result.lastPaymentCents)}</dd>
                  </div>
                )}
                <div>
                  <dt>Total das {months} parcelas</dt>
                  <dd>{money(result.installmentsCents)}</dd>
                </div>
                <div>
                  <dt>Juros nas parcelas</dt>
                  <dd>{money(result.interestCents)}</dd>
                </div>
                <div>
                  <dt>Total com entrada</dt>
                  <dd>{money(result.totalCents)}</dd>
                </div>
              </dl>
              <div
                className="financing-composition"
                role="img"
                aria-label={`Composição do total: entrada ${money(parseMoneyInput(down))}, principal ${money(result.principalCents)}, juros ${money(result.interestCents)}`}
              >
                <span
                  style={{
                    width: `${(parseMoneyInput(down) / result.totalCents) * 100}%`,
                    background: "#88cfff",
                  }}
                />
                <span
                  style={{
                    width: `${(result.principalCents / result.totalCents) * 100}%`,
                    background: "#a3e3b5",
                  }}
                />
                <span
                  style={{
                    width: `${(result.interestCents / result.totalCents) * 100}%`,
                    background: "#ffb3b4",
                  }}
                />
              </div>
              <p className={styles.footnote}>
                Azul: entrada · verde: principal · rosa: juros. Parcelas
                arredondadas para centavos; o contrato pode ajustar a última
                parcela.
              </p>
            </>
          ) : (
            <>
              <h3>Informe sua hipótese de juros.</h3>
              <p>
                Compra maior que zero, entrada entre zero e o preço, prazo de 1
                a 120 meses e taxa mensal de 0% a 20%.
              </p>
            </>
          )}
        </div>
      </div>
      <p className={styles.footnote}>
        IOF, tarifas, seguro e outros encargos não estão incluídos. Este
        resultado não é o CET e não representa aprovação de financiamento.
        Compare com as condições completas do contrato.
      </p>
    </section>
  );
}
