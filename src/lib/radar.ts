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
import { money } from "./vehicle";
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
  const email =
    !!setting("RESEND_API_KEY") &&
    z.email().safeParse(setting("RADAR_EMAIL_TO")).success &&
    !!setting("RADAR_EMAIL_FROM");
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
    emailMissing: !email
      ? ["Canal de e-mail: RESEND_API_KEY, RADAR_EMAIL_FROM e RADAR_EMAIL_TO"]
      : [],
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
        data: { ...value, enabled, nextRunAt: enabled ? new Date() : null },
      });
    });
  if ((await db.radar.count()) >= 30)
    throw new SearchError("Limite de 30 radares.", 409);
  return db.radar.create({
    data: { ...value, enabled, nextRunAt: enabled ? new Date() : null },
  });
}
async function sendEmail(
  row: Listing,
  eventKey: string,
  kind: RadarEventKind,
  matchStatus: RadarMatch,
  previousPriceCents: number | null,
) {
  const c = row.comparison;
  const link = `${setting("RADAR_APP_URL").replace(/\/$/, "")}/anuncios/${row.source}/${encodeURIComponent(row.externalId)}`;
  const description =
    kind === "discount" && c
      ? `${money(row.priceCents!)} · média dos semelhantes: ${money(c.meanCents!)} · ${c.belowPercent!.toFixed(1)}% abaixo · ${c.count} comparáveis`
      : kind === "price_drop"
        ? `Queda de preço: ${money(previousPriceCents!)} para ${money(row.priceCents!)}.`
        : `Novo para este radar: ${money(row.priceCents!)}. A primeira observação não confirma a data de publicação.`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${setting("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": eventKey,
    },
    body: JSON.stringify({
      from: setting("RADAR_EMAIL_FROM"),
      to: [setting("RADAR_EMAIL_TO")],
      subject: `Radar: ${row.title.replace(/[\r\n]/g, " ").slice(0, 110)}`,
      text: `${row.title}\n${description}\n${matchStatus === "uncertain" ? "Correspondência incerta; confira os critérios no anúncio. " + row.reasons.join("; ") : "Correspondência confirmada com os filtros."}\n${row.city ?? "Cidade não informada"}/${row.state ?? ""}\n${link}\nPreços anunciados da amostra observada.`,
    }),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error("O provedor de e-mail não confirmou o envio.");
  const body = await response.json();
  if (typeof body.id !== "string")
    throw new Error("O provedor de e-mail não confirmou o envio.");
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
    const due = await db.radar.findMany({
      where: {
        enabled: true,
        AND: [
          { OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }] },
          { OR: [{ runsRemaining: null }, { runsRemaining: { gt: 0 } }] },
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
      const claimed = await db.radar.updateMany({
        where: { id: radar.id, enabled: true, updatedAt: radar.updatedAt },
        data: {
          lastRunAt: now,
          updatedAt: now,
          nextRunAt: new Date(now.getTime() + radar.intervalHours * 3600000),
          runsRemaining,
        },
      });
      if (!claimed.count) continue;
      const stillCurrent = async () => {
        const current = await db.radar.findUnique({ where: { id: radar.id } });
        return (
          !!current?.enabled && current.updatedAt.getTime() === now.getTime()
        );
      };
      const run = await db.radarRun.create({
        data: {
          radarId: radar.id,
          status: "running",
          message: "Consultando fontes.",
        },
      });
      let sent = 0,
        failed = 0,
        emailLimited = 0;
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
        });
        let baseline = 0,
          newListings = 0,
          drops = 0,
          discounts = 0,
          uncertain = 0,
          incompatible = 0,
          missingPrice = 0;
        const deliveries: {
          row: Listing;
          eventKey: string;
          kind: RadarEventKind;
          matchStatus: RadarMatch;
          previousPriceCents: number | null;
        }[] = [];
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
              const created: typeof deliveries = [];
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
                      radar.channel !== "in_app" && event.kind !== "baseline";
                    await tx.radarNotice.create({
                      data: {
                        radarId: radar.id,
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
          deliveries.push(...sourceEvents);
        }
        for (const event of deliveries) {
          if (
            radar.channel === "in_app" ||
            !infrastructure.email ||
            event.kind === "baseline"
          )
            continue;
          if (sent + failed >= 10) {
            await db.radarNotice.update({
              where: { eventKey: event.eventKey },
              data: { status: "email_limited" },
            });
            emailLimited++;
            continue;
          }
          if (!(await stillCurrent())) break;
          const { row, eventKey, kind, matchStatus, previousPriceCents } =
            event;
          await db.radarNotice.update({
            where: { eventKey },
            data: { status: "sending" },
          });
          try {
            await sendEmail(
              row,
              eventKey,
              kind,
              matchStatus,
              previousPriceCents,
            );
            await db.radarNotice.update({
              where: { eventKey },
              data: { status: "sent", sentAt: new Date() },
            });
            sent++;
          } catch {
            await db.radarNotice.update({
              where: { eventKey },
              data: { status: "unconfirmed" },
            });
            failed++;
          }
        }
        const failures = result.sources.filter((s) => s.status !== "ok");
        await db.radarRun.update({
          where: { id: run.id },
          data: {
            finishedAt: new Date(),
            status: failed || failures.length ? "error" : "ok",
            message: `${baseline} anúncio(s) na primeira verificação; ${newListings} novo(s) para este radar; ${drops} queda(s) de preço; ${discounts} candidato(s) no limite de desconto. ${uncertain} correspondência(s) incerta(s), separadas das confirmadas. ${incompatible} incompatível(is); ${missingPrice} sem preço válido para aviso. ${sent} aviso(s) aceito(s) pelo provedor de e-mail.${radar.channel !== "in_app" && !infrastructure.email ? " E-mail indisponível; avisos preservados no aplicativo." : ""}${failed ? ` ${failed} envio(s) sem confirmação; sem reenvio automático.` : ""}${emailLimited ? ` ${emailLimited} aviso(s) somente no aplicativo: limite de 10 e-mails por execução atingido; sem envio automático posterior.` : ""}${failures.length ? " Falha ou indisponibilidade em fonte: " + failures.map((s) => s.message).join(" ") : ""}${result.sources.some((source) => source.partial) ? " Cobertura parcial: ausência nesta página não significa remoção do anúncio." : ""}`,
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
