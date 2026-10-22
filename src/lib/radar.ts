import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { executeSearch, SearchError } from "./discovery-store";
import { providerConfig, secret } from "./discovery-providers";
import { searchSchema, type Listing } from "./discovery";
import { listingKey } from "./listing-comparison";
import { money } from "./vehicle";
import { radarState } from "./radar-state";

const setting = (name: string) => secret(name, ".env.radar.local");
export const radarSchema = z.object({
  searchId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  minPercent: z.number().min(0).max(50),
  intervalHours: z.union([z.literal(24), z.literal(168)]),
  enabled: z.boolean(),
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
    ready: scheduler && email && link,
    missing: [
      ...(!scheduler
        ? ["Agendador externo e RADAR_CRON_SECRET (mínimo 32 caracteres)"]
        : []),
      ...(!email
        ? ["Canal de e-mail: RESEND_API_KEY, RADAR_EMAIL_FROM e RADAR_EMAIL_TO"]
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
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    infrastructure,
    radars: rows.map((row) => {
      const criteria = searchSchema.parse(JSON.parse(row.search.criteria));
      const connected = criteria.sources.some(
        (s) => providerConfig(s).configured,
      );
      return {
        ...row,
        search: undefined,
        criteria,
        state: radarState({
          enabled: row.enabled,
          ready: infrastructure.ready,
          schedulerSeen,
          connected,
          latest: row.runs[0],
        }),
        nextRunAt:
          row.enabled && infrastructure.ready && schedulerSeen && connected
            ? row.nextRunAt
            : null,
        missing: [
          ...infrastructure.missing,
          ...(!connected ? ["Ao menos uma fonte da busca conectada"] : []),
        ],
      };
    }),
  };
}
export async function saveRadar(input: unknown, id?: string) {
  const value = radarSchema.parse(input);
  if (!(await db.savedSearch.findUnique({ where: { id: value.searchId } })))
    throw new SearchError("Busca não encontrada.", 404);
  if (id)
    return db.radar.update({
      where: { id },
      data: { ...value, nextRunAt: value.enabled ? new Date() : null },
    });
  if ((await db.radar.count()) >= 30)
    throw new SearchError("Limite de 30 radares.", 409);
  return db.radar.create({
    data: { ...value, nextRunAt: value.enabled ? new Date() : null },
  });
}
async function sendEmail(row: Listing, eventKey: string) {
  const c = row.comparison!;
  const link = `${setting("RADAR_APP_URL").replace(/\/$/, "")}/anuncios/${row.source}/${encodeURIComponent(row.externalId)}`;
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
      text: `${row.title}\n${money(row.priceCents!)} · média dos semelhantes: ${money(c.meanCents!)} · ${c.belowPercent!.toFixed(1)}% abaixo · ${c.count} comparáveis\n${row.city ?? "Cidade não informada"}/${row.state ?? ""}\n${link}\nPreços anunciados da amostra observada.`,
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
  if (!infrastructure.ready)
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
  try {
    const due = await db.radar.findMany({
      where: {
        enabled: true,
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
      },
      orderBy: { nextRunAt: "asc" },
      take: 3,
    });
    for (const radar of due) {
      // A pause/edit/delete before the claim prevents this execution.
      const now = new Date();
      const claimed = await db.radar.updateMany({
        where: { id: radar.id, enabled: true, updatedAt: radar.updatedAt },
        data: {
          lastRunAt: now,
          nextRunAt: new Date(now.getTime() + radar.intervalHours * 3600000),
        },
      });
      if (!claimed.count) continue;
      const run = await db.radarRun.create({
        data: {
          radarId: radar.id,
          status: "running",
          message: "Consultando fontes.",
        },
      });
      let sent = 0,
        failed = 0;
      try {
        const result = await executeSearch(radar.searchId, {
          reuseRecent: true,
        });
        const qualified = result.sources
          .flatMap((s) => (s.status === "ok" ? s.listings : []))
          .filter(
            (row) =>
              !row.reasons.length &&
              row.comparison?.status === "valid" &&
              row.comparison.belowPercent! >= radar.minPercent,
          );
        for (const row of qualified) {
          // Bound worst-case execution time; unprocessed matches remain eligible on the next run.
          if (sent + failed >= 10) break;
          if (
            !(await db.radar.findUnique({ where: { id: radar.id } }))?.enabled
          )
            break;
          const key = listingKey(row);
          const previous = await db.radarNotice.findFirst({
            where: { radarId: radar.id, listingKey: key },
            orderBy: { createdAt: "desc" },
          });
          if (previous && row.priceCents! > previous.priceCents * 0.99)
            continue;
          const eventKey = createHash("sha256")
            .update(`${radar.id}:${key}:${row.priceCents}`)
            .digest("hex");
          if (await db.radarNotice.findUnique({ where: { eventKey } }))
            continue;
          await db.radarNotice.create({
            data: {
              radarId: radar.id,
              listingKey: key,
              priceCents: row.priceCents!,
              eventKey,
              status: "sending",
            },
          });
          try {
            await sendEmail(row, eventKey);
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
            message: `${qualified.length} candidato(s) no limite; ${sent} aviso(s) aceito(s) pelo provedor de e-mail.${failed ? ` ${failed} envio(s) sem confirmação; sem reenvio automático.` : ""}${failures.length ? " Falha ou indisponibilidade em fonte: " + failures.map((s) => s.message).join(" ") : ""}`,
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
      }
      processed++;
    }
  } finally {
    await db.searchLock.deleteMany({ where: { id: "radar-tick", expiresAt } });
  }
  return { processed };
}
