/** Brazilian display formats; never silently reinterpret exponents or negative values. */
export function parseMoneyInput(value: string): number {
  let text = value
    .trim()
    .replace(/^R\$\s*/, "")
    .replace(/\s/g, "");
  if (!text || !/^[0-9.,]+$/.test(text)) return NaN;
  if (text.includes(",")) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{0,2}$/.test(text)) return NaN;
    text = text.replaceAll(".", "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(text))
    text = text.replaceAll(".", "");
  else if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return NaN;
  const cents = Math.round(Number(text) * 100);
  return Number.isSafeInteger(cents) ? cents : NaN;
}
export function moneyInput(cents: number): string {
  return Number.isFinite(cents)
    ? (cents / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "";
}
export function parseMileageInput(value: string): number {
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(text)) return NaN;
  const n = Number(text.replaceAll(".", ""));
  return Number.isSafeInteger(n) ? n : NaN;
}
export function mileageInput(value: string): string {
  const digits = value.replaceAll(".", "");
  return /^\d{0,8}$/.test(digits)
    ? digits
      ? Number(digits).toLocaleString("pt-BR")
      : ""
    : value;
}
