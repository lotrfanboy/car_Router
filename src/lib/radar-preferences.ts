import { z } from "zod";
import { db } from "./db";
import { SearchError } from "./discovery-store";
import { listRadars, saveRadar, radarInfrastructure } from "./radar";

const preferences = z.object({
  experience: z.literal("managed"),
  searchId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
});
/** Platform-owned, bounded policy. An absent allowance never authorizes spend. */
export function managedRadarPolicy(
  allowance = process.env.RADAR_MANAGED_RUN_LIMIT,
) {
  const limit = allowance && /^\d+$/.test(allowance) ? Number(allowance) : 0;
  return {
    intervalHours: 24 as const,
    runsRemaining:
      Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : 0,
  };
}
export async function saveRadarPreferences(input: unknown, id?: string) {
  const value = preferences.parse(input);
  if (id) {
    const current = await db.radar.findUnique({ where: { id } });
    if (!current) throw new SearchError("Radar não encontrado.", 404);
    // Editing a name/search never replenishes allowance or resumes a paused radar.
    return saveRadar(
      { ...current, name: value.name, searchId: value.searchId },
      id,
    );
  }
  const policy = managedRadarPolicy();
  const { infrastructure } = await listRadars();
  return saveRadar({
    searchId: value.searchId,
    name: value.name,
    ...policy,
    enabled:
      policy.runsRemaining > 0 &&
      infrastructure.ready &&
      infrastructure.missing.length === 0,
    minPercent: 10,
    mode: "new_listings",
    channel: "both",
  });
}
export async function pauseRadar(id: string) {
  const current = await db.radar.findUnique({ where: { id } });
  if (!current) throw new SearchError("Radar não encontrado.", 404);
  return saveRadar({ ...current, enabled: false }, id);
}

/** Resume consumes only an existing allowance; it never grants or replenishes one. */
export async function resumeRadar(id: string) {
  const current = await db.radar.findUnique({ where: { id } });
  if (!current) throw new SearchError("Radar não encontrado.", 404);
  const infrastructure = radarInfrastructure();
  if (!infrastructure.ready || infrastructure.missing.length)
    throw new SearchError(
      "O monitoramento ainda não está liberado neste ambiente. Confira a situação em Configurações; o radar continua pausado.",
      409,
    );
  if (current.runsRemaining === null || current.runsRemaining <= 0)
    throw new SearchError(
      "Não há execuções autorizadas disponíveis. A plataforma precisa liberar um limite de monitoramento antes de ativar este radar.",
      409,
    );
  if (["email", "both"].includes(current.channel) && !infrastructure.email)
    throw new SearchError(
      "O envio de e-mail precisa estar validado e habilitado antes de ativar este radar.",
      409,
    );
  return saveRadar({ ...current, enabled: true }, id);
}
