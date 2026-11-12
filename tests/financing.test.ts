import { describe, it, expect } from "vitest";
import { simulateFinancing } from "../src/lib/financing";
describe("fixed installment financing", () => {
  it("conserves zero-interest principal with last-payment rounding", () => {
    expect(
      simulateFinancing({
        priceCents: 10000000,
        downPaymentCents: 2000000,
        months: 12,
        monthlyRatePercent: 0,
      }),
    ).toMatchObject({
      principalCents: 8000000,
      paymentCents: 666667,
      lastPaymentCents: 666663,
      totalCents: 10000000,
      interestCents: 0,
    });
  });
  it("matches an independently calculated decimal Price example", () => {
    expect(
      simulateFinancing({
        priceCents: 100000,
        downPaymentCents: 0,
        months: 12,
        monthlyRatePercent: 1,
      }),
    ).toMatchObject({
      paymentCents: 8885,
      lastPaymentCents: 8884,
      installmentsCents: 106619,
      interestCents: 6619,
    });
  });
  it("allows fully paid purchases without inventing interest", () => {
    expect(
      simulateFinancing({
        priceCents: 12500000,
        downPaymentCents: 12500000,
        months: 36,
        monthlyRatePercent: 2,
      }),
    ).toMatchObject({
      paymentCents: 0,
      interestCents: 0,
      totalCents: 12500000,
    });
  });
  it("rejects invalid or missing assumptions", () => {
    const v = {
      priceCents: 100000,
      downPaymentCents: 0,
      months: 12,
      monthlyRatePercent: 1,
    };
    for (const change of [
      { downPaymentCents: 100001 },
      { downPaymentCents: -1 },
      { months: 0 },
      { months: 12.5 },
      { months: 121 },
      { monthlyRatePercent: NaN },
      { monthlyRatePercent: -1 },
      { priceCents: 1.2 },
    ])
      expect(simulateFinancing({ ...v, ...change })).toBeNull();
  });
});
