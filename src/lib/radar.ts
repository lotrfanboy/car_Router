import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import {
  currentSearchCriteria,
  executeSearch,
  SearchError,
} from "./discovery-store";
import { providerConfig, secret } from "./discovery-providers";
import { listingMatchStatus, type Listing } from "./discovery";
import { listingKey } from "./listing-comparison";
import {
  radarEmailConfiguration,
  queueRadarEmails,
  deliverPendingRadarEmails,
  reconcileRadarEmails,
} from "./radar-email";
import { radarState } from "./radar-state";
import {
  radarEvent,
  radarEventKey,
  type RadarEventKind,
  type RadarMatch,
} from "./radar-events";

const setting = (name: string) => secret(name, ".env.radar.local");
export const radarSchema = z.object({
  searchId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  minPercent: z.number().min(0).max(50),
  intervalHours: z.union([z.literal(24), z.literal(168)]),
  enabled: z.boolean(),
  mode: z.enum(["new_listings", "discount"]).default("discount"),
  channel: z.enum(["in_app", "email", "both"]).default("email"),
  runsRemaining: z.number().int().min(0).max(100).nullable().default(null),
});
export function radarInfrastructure() {
  const scheduler =
    setting("RADAR_SCHEDULER_ENABLED") === "true" &&
    setting("RADAR_CRON_SECRET").length >= 32;
  const emailConfig = radarEmailConfiguration();
  const email = emailConfig.configured && emailConfig.enabled;
  const origin = setting("RADAR_APP_URL");
  let link = false;
  try {
    const u = new URL(origin);
    link = u.protocol === "https:" && !u.username && !u.password;
  } catch {}
  return {
    scheduler,
    email,
    link,
    ready: scheduler && link,
    emailConfiguration: emailConfig,
    emailMissing: [
      ...emailConfig.missing.map((name) => `Canal de e-mail: ${name}`),
      ...(!emailConfig.enabled
        ? ["Canal de e-mail: RADAR_EMAIL_ENABLED=true após validar o teste"]
        : []),
    ],
    missing: [
      ...(!scheduler
        ? ["Agendador externo e RADAR_CRON_SECRET (mínimo 32 caracteres)"]
        : []),
      ...(!link ? ["RADAR_APP_URL com a URL HTTPS do aplicativo"] : []),
    ],
  };
}
export function authorizedTick(request: Request) {
  const expected = setting("RADAR_CRON_SECRET");
  if (expected.length < 32) return false;
  const actual = request.headers.get("authorization") ?? "";
  const a = Buffer.from(actual),
    b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function listRadars() {
  const infrastructure = radarInfrastructure();
  const heartbeat = await db.searchLock.findUnique({
    where: { id: "radar-heartbeat" },
  });
  const schedulerSeen =
    !!heartbeat && heartbeat.expiresAt.getTime() > Date.now();
  if (infrastructure.scheduler && !schedulerSeen)
    infrastructure.missing.push(
      "Primeira execução do agendador (ou sem contato nos últimos 60 minutos)",
    );
  const rows = await db.radar.findMany({
    include: {
      search: true,
      runs: { orderBy: { startedAt: "desc" }, take: 5 },
      notices: { orderBy: { createdAt: "desc" }, take: 50 },
      emailDeliveries: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          runId: true,
          status: true,
          attempts: true,
          providerId: true,
          acceptedAt: true,
          deliveredAt: true,
          lastError: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    infrastructure,
    radars: await Promise.all(
      rows.map(async (row) => {
        const criteria = await currentSearchCriteria(
          JSON.parse(row.search.criteria),
        );
        const connected = criteria.sources.some(
          (s) => providerConfig(s).configured,
        );
        const ready =
          infrastructure.ready &&
          row.runsRemaining !== null &&
          (row.channel !== "email" || infrastructure.email);
        return {
          ...row,
          search: undefined,
          criteria,
          notices: row.notices.map((notice) => {
            let listing: Listing | null = null;
            try {
              listing = notice.payload
                ? (JSON.parse(notice.payload) as Listing)
                : null;
            } catch {}
            return { ...notice, payload: undefined, listing };
          }),
          state: radarState({
            enabled: row.enabled,
            ready,
            schedulerSeen,
            connected,
            latest: row.runs[0],
          }),
          nextRunAt:
            row.enabled &&
            ready &&
            schedulerSeen &&
            connected &&
            row.runsRemaining !== 0
              ? row.nextRunAt
              : null,
          missing: [
            ...infrastructure.missing,
            ...(row.runsRemaining === null
              ? ["Defina um limite de execuções para agendar este MVP"]
              : []),
            ...(row.channel === "email" ? infrastructure.emailMissing : []),
            ...(!connected ? ["Ao menos uma fonte da busca conectada"] : []),
          ],
        };
      }),
    ),
  };
}
export async function saveRadar(input: unknown, id?: string) {
  const value = radarSchema.parse(input);
  if (!(await db.savedSearch.findUnique({ where: { id: value.searchId } })))
    throw new SearchError("Busca não encontrada.", 404);
  if (value.enabled && value.runsRemaining === null)
    throw new SearchError(
      "Defina o limite de execuções antes de ativar o Radar.",
      409,
    );
  const enabled = value.enabled && value.runsRemaining !== 0;
  if (id)
    return db.$transaction(async (tx) => {
      const previous = await tx.radar.findUnique({ where: { id } });
      if (!previous) throw new SearchError("Radar não encontrado.", 404);
      // A changed monitored search/mode starts its own baseline. Alert history stays.
      if (
        previous.searchId !== value.searchId ||
        previous.mode !== value.mode
      ) {
        await tx.radarSourceState.deleteMany({ where: { radarId: id } });
        await tx.radarObservation.deleteMany({ where: { radarId: id } });
      }
      return tx.radar.update({
        where: { id },
        data: {
          ...value,
          enabled,
          nextRunAt: enabled
            ? previous.enabled
              ? previous.nextRunAt
              : new Date()
            : null,
        },
      });
    });
  if ((await db.radar.count()) >= 30)
    throw new SearchError("Limite de 30 radares.", 409);
  return db.radar.create({
    data: { ...value, enabled, nextRunAt: enabled ? new Date() : null },
  });
}
export async function tickRadars() {
  const infrastructure = radarInfrastructure();
  if (!infrastructure.scheduler || !infrastructure.link)
    throw new SearchError(
      `Configuração pendente: ${infrastructure.missing.join("; ")}.`,
      409,
    );
  await db.searchLock.upsert({
    where: { id: "radar-heartbeat" },
    create: {
      id: "radar-heartbeat",
      expiresAt: new Date(Date.now() + 3600000),
    },
    update: { expiresAt: new Date(Date.now() + 3600000) },
  });
  const expiresAt = new Date(Date.now() + 30 * 60000);
  try {
    await db.$transaction(async (tx) => {
      await tx.searchLock.deleteMany({
        where: { id: "radar-tick", expiresAt: { lt: new Date() } },
      });
      await tx.searchLock.create({ data: { id: "radar-tick", expiresAt } });
    });
  } catch {
    throw new SearchError("Uma execução de Radar está em andamento.", 409);
  }
  let processed = 0;
  let blockedEmail = false;
  try {
    // A restart must not re-collect a claimed run. Recover only its durable notices.
    // Mark abandoned runs for review; the already advanced nextRunAt remains intact.
    const staleBefore = new Date(Date.now() - 30 * 60000);
    await db.radarRun.updateMany({
      where: { status: "running", startedAt: { lt: staleBefore } },
      data: {
        status: "error",
        finishedAt: new Date(),
        message:
          "Execução interrompida; coleta não repetida. Avisos persistidos preservados.",
      },
    });
    await queueRadarEmails();
    await deliverPendingRadarEmails();
    await reconcileRadarEmails();
    const due = await db.radar.findMany({
      where: {
        enabled: true,
        runs: { none: { status: "running" } },
        AND: [
          { OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }] },
          { runsRemaining: { gt: 0 } },
        ],
      },
      include: { search: true },
      orderBy: { nextRunAt: "asc" },
      // There are at most 30 saved radars. Unconfigured email-only rows must
      // not occupy the three execution slots available to internal channels.
      take: 30,
    });
    for (const radar of due) {
      if (processed >= 3) break;
      if (radar.channel === "email" && !infrastructure.email) {
        blockedEmail = true;
        continue;
      }
      // A pause/edit/delete before the claim prevents this execution.
      const now = new Date();
      const runsRemaining =
        radar.runsRemaining === null ? null : radar.runsRemaining - 1;
      const run = await db.$transaction(async (tx) => {
        const claimed = await tx.radar.updateMany({
          where: {
            id: radar.id,
            enabled: true,
            updatedAt: radar.updatedAt,
            runsRemaining: radar.runsRemaining,
            nextRunAt: radar.nextRunAt,
            runs: { none: { status: "running" } },
          },
          data: {
            lastRunAt: now,
            updatedAt: now,
            nextRunAt: new Date(now.getTime() + radar.intervalHours * 3600000),
            runsRemaining,
          },
        });
        if (!claimed.count) return null;
        return tx.radarRun.create({
          data: {
            radarId: radar.id,
            status: "running",
            message: "Consultando fontes.",
          },
        });
      });
      if (!run) continue;
      const stillCurrent = async () => {
        const current = await db.radar.findUnique({ where: { id: radar.id } });
        return (
          !!current?.enabled && current.updatedAt.getTime() === now.getTime()
        );
      };
      try {
        if (!(await stillCurrent()))
          throw new SearchError(
            "Radar alterado ou pausado antes da consulta.",
            409,
          );
        const criteria = await currentSearchCriteria(
          JSON.parse(radar.search.criteria),
        );
        const result = await executeSearch(radar.searchId, {
          reuseRecent: true,
          budgetScope: "scheduled",
        });
        let baseline = 0,
          newListings = 0,
          drops = 0,
          discounts = 0,
          uncertain = 0,
          incompatible = 0,
          missingPrice = 0;
        type DeliveryEvent = {
          row: Listing;
          eventKey: string;
          kind: RadarEventKind;
          matchStatus: RadarMatch;
          previousPriceCents: number | null;
        };
        for (const source of result.sources.filter(
          (item) => item.status === "ok",
        )) {
          if (!(await stillCurrent()))
            throw new SearchError(
              "Radar alterado ou pausado; processamento interrompido.",
              409,
            );
          const rows = [
            ...new Map(
              source.listings.map((row) => [listingKey(row), row]),
            ).values(),
          ];
          const sourceEvents = await db.$transaction(
            async (tx) => {
              // Hold this row while writing the source snapshot. A concurrent edit
              // either wins before this claim or waits until this snapshot commits.
              const owned = await tx.radar.updateMany({
                where: {
                  id: radar.id,
                  enabled: true,
                  updatedAt: now,
                },
                data: { updatedAt: now },
              });
              if (!owned.count)
                throw new SearchError(
                  "Radar alterado ou pausado; processamento interrompido.",
                  409,
                );
              const sourceState = await tx.radarSourceState.findUnique({
                where: {
                  radarId_source: { radarId: radar.id, source: source.source },
                },
              });
              const previousRows = await tx.radarObservation.findMany({
                where: {
                  radarId: radar.id,
                  listingKey: { in: rows.map(listingKey) },
                },
              });
              const previousByKey = new Map(
                previousRows.map((row) => [row.listingKey, row]),
              );
              const created: DeliveryEvent[] = [];
              for (const row of rows) {
                const key = listingKey(row);
                const previous = previousByKey.get(key);
                const match = listingMatchStatus(row, criteria);
                if (match === "incompatible") incompatible++;
                else if (row.priceCents === null || row.priceCents <= 0)
                  missingPrice++;
                const event = radarEvent(row, criteria, {
                  mode: radar.mode,
                  minPercent: radar.minPercent,
                  initialized: !!sourceState,
                  previous,
                });
                let eventKey: string | null = null;
                if (event) {
                  // Old discount notices retain their existing throttling semantics.
                  const lastNotice =
                    radar.mode === "discount"
                      ? await tx.radarNotice.findFirst({
                          where: { radarId: radar.id, listingKey: key },
                          orderBy: { createdAt: "desc" },
                        })
                      : null;
                  const eligiblePrice =
                    !lastNotice ||
                    row.priceCents! <= lastNotice.priceCents * 0.99;
                  const proposedKey = radarEventKey(
                    radar.id,
                    radar.searchId,
                    key,
                    row.priceCents!,
                  );
                  if (
                    eligiblePrice &&
                    !(await tx.radarNotice.findUnique({
                      where: { eventKey: proposedKey },
                    }))
                  ) {
                    eventKey = proposedKey;
                    const emailRequested =
                      radar.channel !== "in_app" &&
                      event.kind !== "baseline" &&
                      event.matchStatus === "confirmed" &&
                      !previous;
                    await tx.radarNotice.create({
                      data: {
                        radarId: radar.id,
                        runId: run.id,
                        emailEligible: emailRequested,
                        listingKey: key,
                        priceCents: row.priceCents!,
                        previousPriceCents: previous?.priceCents ?? null,
                        eventKey,
                        kind: event.kind,
                        matchStatus: event.matchStatus,
                        payload: JSON.stringify(row),
                        channel: radar.channel,
                        status:
                          emailRequested && !infrastructure.email
                            ? "email_unavailable"
                            : "recorded",
                      },
                    });
                    created.push({
                      row,
                      eventKey,
                      kind: event.kind,
                      matchStatus: event.matchStatus,
                      previousPriceCents: previous?.priceCents ?? null,
                    });
                  }
                }
                await tx.radarObservation.upsert({
                  where: {
                    radarId_listingKey: { radarId: radar.id, listingKey: key },
                  },
                  create: {
                    radarId: radar.id,
                    listingKey: key,
                    priceCents: row.priceCents,
                    lastNotifiedPriceCents: eventKey ? row.priceCents : null,
                    lastSeenAt: new Date(row.observedAt),
                  },
                  update: {
                    priceCents: row.priceCents,
                    lastSeenAt: new Date(row.observedAt),
                    ...(eventKey
                      ? { lastNotifiedPriceCents: row.priceCents }
                      : {}),
                  },
                });
              }
              // A successful empty source also establishes a baseline. Failed sources never do.
              await tx.radarSourceState.upsert({
                where: {
                  radarId_source: { radarId: radar.id, source: source.source },
                },
                create: { radarId: radar.id, source: source.source },
                update: {},
              });
              return created;
            },
            { timeout: 30000 },
          );
          for (const event of sourceEvents) {
            if (event.kind === "baseline") baseline++;
            if (event.kind === "new_listing") newListings++;
            if (event.kind === "price_drop") drops++;
            if (event.kind === "discount") discounts++;
            if (event.matchStatus === "uncertain") uncertain++;
          }
        }
        const failures = result.sources.filter((s) => s.status !== "ok");
        await db.radarRun.update({
          where: { id: run.id },
          data: {
            finishedAt: new Date(),
            status: failures.length ? "error" : "ok",
            message: `${baseline} anúncio(s) na primeira verificação; ${newListings} novo(s) para este radar; ${drops} queda(s) de preço; ${discounts} candidato(s) no limite de desconto. ${uncertain} correspondência(s) incerta(s), separadas das confirmadas. ${incompatible} incompatível(is); ${missingPrice} sem preço válido para aviso. Avisos internos preservados; eventuais resumos são entregues separadamente, sem repetir a coleta.${radar.channel !== "in_app" && !infrastructure.email ? " E-mail indisponível; avisos preservados no aplicativo." : ""}${failures.length ? " Falha ou indisponibilidade em fonte: " + failures.map((s) => s.message).join(" ") : ""}${result.sources.some((source) => source.partial) ? " Cobertura parcial: ausência nesta página não significa remoção do anúncio." : ""}`,
          },
        });
      } catch (e) {
        await db.radarRun.update({
          where: { id: run.id },
          data: {
            finishedAt: new Date(),
            status: "error",
            message:
              e instanceof SearchError
                ? e.message
                : "Execução interrompida. Nenhum envio confirmado.",
          },
        });
      } finally {
        try {
          await queueRadarEmails();
          await deliverPendingRadarEmails();
        } catch {
          // Durable notices retain runId/emailEligible; the next tick only retries enqueue/delivery.
          console.error("Radar: entrega pendente; avisos preservados.");
        }
        // Consume the bounded attempt even on collection failure; pause only after its events.
        if (runsRemaining === 0)
          await db.radar.updateMany({
            where: {
              id: radar.id,
              updatedAt: now,
              runsRemaining: 0,
            },
            data: { enabled: false, nextRunAt: null },
          });
      }
      processed++;
    }
  } finally {
    await db.searchLock.deleteMany({ where: { id: "radar-tick", expiresAt } });
  }
  return !processed && blockedEmail
    ? { processed: 0, skipped: "email-unavailable" as const }
    : { processed };
}
