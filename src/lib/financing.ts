export type FinancingInput = {
  priceCents: number;
  downPaymentCents: number;
  months: number;
  monthlyRatePercent: number;
};
/** Fixed-payment (Price) scenario. No bank quote, CET, taxes or insurance are implied. */
export function simulateFinancing(input: FinancingInput) {
  const { priceCents, downPaymentCents, months, monthlyRatePercent } = input;
  if (
    ![priceCents, downPaymentCents].every(Number.isSafeInteger) ||
    priceCents <= 0 ||
    priceCents > 2_000_000_000 ||
    downPaymentCents < 0 ||
    downPaymentCents > priceCents ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 120 ||
    !Number.isFinite(monthlyRatePercent) ||
    monthlyRatePercent < 0 ||
    monthlyRatePercent > 20
  )
    return null;
  const principalCents = priceCents - downPaymentCents,
    rate = monthlyRatePercent / 100;
  const paymentCents = Math.round(
    principalCents === 0
      ? 0
      : rate === 0
        ? principalCents / months
        : (principalCents * rate) / -Math.expm1(-months * Math.log1p(rate)),
  );
  let balance = principalCents,
    installmentsCents = 0,
    lastPaymentCents = 0;
  for (let month = 1; month <= months; month++) {
    const interest = Math.round(balance * rate);
    const due =
      month === months
        ? balance + interest
        : Math.min(paymentCents, balance + interest);
    balance = Math.max(0, balance + interest - due);
    installmentsCents += due;
    if (month === months) lastPaymentCents = due;
  }
  return {
    principalCents,
    paymentCents,
    lastPaymentCents,
    installmentsCents,
    totalCents: downPaymentCents + installmentsCents,
    interestCents: Math.max(0, installmentsCents - principalCents),
    annualRatePercent: (Math.pow(1 + rate, 12) - 1) * 100,
  };
}
