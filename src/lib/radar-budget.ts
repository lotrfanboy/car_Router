type Settings = Record<string, string | undefined>;
/** Optional platform window. Missing keeps the existing deployment contract. */
export function scheduledWindow(
  settings: Settings = process.env,
  now = Date.now(),
) {
  const until = settings.RADAR_SCHEDULED_UNTIL?.trim();
  if (!until) return { allowed: true, expiresAt: null, reason: null };
  const timestamp = Date.parse(until);
  if (!/^\d{4}-\d{2}-\d{2}T.+Z$/.test(until) || !Number.isFinite(timestamp))
    return {
      allowed: false,
      expiresAt: null,
      reason: "RADAR_SCHEDULED_UNTIL inválido; agendamento bloqueado",
    };
  return {
    allowed: now < timestamp,
    expiresAt: new Date(timestamp).toISOString(),
    reason:
      now < timestamp ? null : "Período autorizado de monitoramento encerrado",
  };
}
/** Count all local reservations conservatively; a manual query cannot expand scheduled allowance. */
export function scheduledCreditBlock(
  provider: string,
  total: number,
  credits: number,
  settings: Settings = process.env,
): string | null {
  const window = scheduledWindow(settings);
  if (!window.allowed) return window.reason;
  const name = `RADAR_SCHEDULED_${provider.toUpperCase()}_TOTAL_CREDIT_CAP`;
  const raw = settings[name]?.trim();
  if (!raw) return null;
  const cap = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(cap))
    return `${name} inválido; coleta agendada bloqueada`;
  return total + credits > cap
    ? `Teto autorizado de créditos agendados atingido (${provider}). Nenhuma recarga será feita.`
    : null;
}
