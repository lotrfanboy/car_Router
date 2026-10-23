import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { secret } from "./discovery-providers";
import { publicListingUrl, sourceNames, type Listing } from "./discovery";
import { money } from "./vehicle";

const setting = (name: string) => secret(name, ".env.radar.local");
const MAX_ATTEMPTS = 3;
const RETRY_WINDOW = 23 * 3600000; // Resend retains keys for 24h; never cross that boundary.

/** MVP server configuration. Replace here with the radar owner's verified email later. */
export function resolveRadarRecipient() {
  const result = z.email().safeParse(setting("RADAR_EMAIL_TO"));
  return result.success ? result.data : null;
}
export function radarEmailConfiguration() {
  const from = setting("RADAR_EMAIL_FROM");
  const address = from.match(/<([^<>]+)>$/)?.[1] ?? from;
  const validFrom =
    z.email().safeParse(address).success &&
    !/[\r\n]/.test(from) &&
    !/@gmail\.com$/i.test(address);
  const missing = [
    ...(!setting("RESEND_API_KEY") ? ["RESEND_API_KEY"] : []),
    ...(!validFrom
      ? ["RADAR_EMAIL_FROM (remetente autorizado no Resend; não Gmail)"]
      : []),
    ...(!resolveRadarRecipient() ? ["RADAR_EMAIL_TO"] : []),
  ];
  return {
    configured: missing.length === 0,
    enabled: setting("RADAR_EMAIL_ENABLED") === "true",
    missing,
  };
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function httpsUrl(value?: string | null) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export type RadarEmailPayload = {
  from: string;
  to: [string];
  subject: string;
  text: string;
  html: string;
};
export function buildRadarEmail(
  name: string,
  radarId: string,
  listings: Listing[],
): RadarEmailPayload {
  const to = resolveRadarRecipient();
  if (!to || !radarEmailConfiguration().configured)
    throw new Error("E-mail não configurado.");
  const app = httpsUrl(setting("RADAR_APP_URL"));
  if (!app) throw new Error("RADAR_APP_URL precisa de HTTPS.");
  const radarLink = `${app.replace(/\/$/, "")}/radares#radar-${encodeURIComponent(radarId)}`;
  const intro =
    "Novas oportunidades observadas desde a base deste radar. A primeira observação não confirma a data real de publicação.";
  const rows = listings.map((row) => {
    const car = `${row.title} · ano ${row.modelYear ?? "não informado"}`;
    const description = `${money(row.priceCents!)} · ${row.city ?? "Cidade não informada"}/${row.state ?? "UF não informada"} · ${sourceNames[row.source]}`;
    const original = publicListingUrl(row.url, row.source) ? row.url : null;
    const image = httpsUrl(row.imageUrl);
    return {
      text: `${car}\n${description}\n${original ?? "Link original indisponível"}`,
      html: `<li><strong>${escapeHtml(car)}</strong><p>${escapeHtml(description)}</p>${image ? `<img src="${escapeHtml(image)}" alt="Foto do anúncio" width="240" />` : ""}${original ? `<p><a href="${escapeHtml(original)}">Abrir anúncio original</a></p>` : ""}</li>`,
    };
  });
  return {
    from: setting("RADAR_EMAIL_FROM"),
    to: [to],
    subject: `Radar: ${listings.length} nova(s) oportunidade(s) · ${name.replace(/[\r\n]/g, " ").slice(0, 100)}`,
    text: `${name}\n${intro}\n\n${rows.map((r) => r.text).join("\n\n")}\n\nAbrir radar: ${radarLink}`,
    html: `<h1>${escapeHtml(name)}</h1><p>${intro}</p><ul>${rows.map((r) => r.html).join("")}</ul><a href="${escapeHtml(radarLink)}">Abrir radar</a>`,
  };
}

/** Recover completed/interrupted runs from durable notices, including a crash before enqueue. */
export async function queueRadarEmails() {
  const runs = await db.radarRun.findMany({
    where: {
      status: { not: "running" },
      emailDelivery: null,
      notices: { some: { emailEligible: true } },
    },
    include: {
      radar: true,
      notices: { where: { emailEligible: true }, orderBy: { eventKey: "asc" } },
    },
    orderBy: { startedAt: "asc" },
    take: 30,
  });
  for (const run of runs) {
    const listings = run.notices.map(
      (notice) => JSON.parse(notice.payload!) as Listing,
    );
    const payload = radarEmailConfiguration().configured
      ? JSON.stringify(buildRadarEmail(run.radar.name, run.radarId, listings))
      : null;
    await db.radarEmailDelivery.upsert({
      where: { runId: run.id },
      update: {},
      create: {
        radarId: run.radarId,
        runId: run.id,
        idempotencyKey: `radar-run/${run.id}`,
        payload,
      },
    });
  }
}

/** Delivery only: this function never invokes a listing provider or changes run credits. */
export async function deliverPendingRadarEmails(onlyId?: string) {
  const config = radarEmailConfiguration();
  if (!config.configured || (!onlyId && !config.enabled)) return;
  // A process lost after the POST may have sent the message. Quarantine; don't blindly retry.
  await db.radarEmailDelivery.updateMany({
    where: {
      status: "sending",
      claimedAt: { lt: new Date(Date.now() - 5 * 60000) },
    },
    data: {
      status: "unknown",
      lastError:
        "Processo interrompido; conferir no Resend antes de qualquer ação.",
    },
  });
  const pending = await db.radarEmailDelivery.findMany({
    where: {
      ...(onlyId
        ? { id: onlyId }
        : { kind: "digest", radar: { enabled: true } }),
      status: { in: ["pending", "retry"] },
      nextAttemptAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
    include: {
      radar: true,
      run: {
        include: {
          notices: {
            where: { emailEligible: true },
            orderBy: { eventKey: "asc" },
          },
        },
      },
    },
  });
  for (const delivery of pending) {
    if (
      delivery.attempts >= MAX_ATTEMPTS ||
      (delivery.firstAttemptAt &&
        Date.now() - delivery.firstAttemptAt.getTime() >= RETRY_WINDOW)
    ) {
      await db.radarEmailDelivery.updateMany({
        where: { id: delivery.id, status: delivery.status },
        data: {
          status: "failed",
          lastError:
            "Limite de tentativas ou janela de idempotência encerrada; revisar no Resend.",
        },
      });
      continue;
    }
    const payload =
      delivery.payload ??
      JSON.stringify(
        buildRadarEmail(
          delivery.radar!.name,
          delivery.radarId!,
          delivery.run!.notices.map(
            (notice) => JSON.parse(notice.payload!) as Listing,
          ),
        ),
      );
    const claimedAt = new Date();
    const claimed = await db.radarEmailDelivery.updateMany({
      where: {
        id: delivery.id,
        status: delivery.status,
        attempts: delivery.attempts,
        ...(!onlyId
          ? { radar: { enabled: true, updatedAt: delivery.radar!.updatedAt } }
          : {}),
      },
      data: {
        status: "sending",
        payload,
        claimedAt,
        firstAttemptAt: delivery.firstAttemptAt ?? claimedAt,
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) continue;
    let providerId: string | undefined;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${setting("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": delivery.idempotencyKey,
        },
        body: payload,
      });
      if (!response.ok) {
        // 429 explicitly rejects the request. Other 4xx need configuration fixes;
        // 409 and 5xx are ambiguous and must not cause another blind POST.
        const retry =
          response.status === 429 && delivery.attempts + 1 < MAX_ATTEMPTS;
        const unknown = response.status === 409 || response.status >= 500;
        await db.radarEmailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: retry ? "retry" : unknown ? "unknown" : "failed",
            nextAttemptAt: new Date(Date.now() + 30 * 60000),
            lastError: `Resend HTTP ${response.status}; ${retry ? "entrega pendente" : unknown ? "resultado incerto; revisar no provedor" : "envio recusado"}.`,
          },
        });
        continue;
      }
      const body = await response.json();
      if (typeof body.id !== "string" || !body.id)
        throw new Error("Resposta sem ID.");
      providerId = body.id;
      await db.radarEmailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "accepted",
          providerId,
          acceptedAt: new Date(),
          lastError: null,
        },
      });
    } catch {
      await db.radarEmailDelivery.updateMany({
        where: { id: delivery.id, status: "sending" },
        data: {
          status: providerId ? "accepted" : "unknown",
          providerId,
          ...(providerId ? { acceptedAt: new Date() } : {}),
          lastError: providerId
            ? null
            : "Resultado incerto; conferir no Resend. Sem reenvio automático.",
        },
      });
    }
  }
}

/** Read provider state; acceptance alone never means delivery. No new POST here. */
export async function reconcileRadarEmails() {
  if (!radarEmailConfiguration().configured) return;
  const rows = await db.radarEmailDelivery.findMany({
    where: {
      status: "accepted",
      createdAt: { gte: new Date(Date.now() - 86400000) },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  for (const row of rows) {
    if (!row.providerId) continue;
    try {
      const response = await fetch(
        `https://api.resend.com/emails/${encodeURIComponent(row.providerId)}`,
        {
          headers: { Authorization: `Bearer ${setting("RESEND_API_KEY")}` },
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) continue;
      const body = await response.json();
      if (body.id !== row.providerId) continue;
      if (body.last_event === "delivered")
        await db.radarEmailDelivery.update({
          where: { id: row.id },
          data: { status: "delivered", deliveredAt: new Date() },
        });
      else if (["bounced", "failed", "suppressed"].includes(body.last_event))
        await db.radarEmailDelivery.update({
          where: { id: row.id },
          data: {
            status: "failed",
            lastError: `Resend: ${body.last_event}. Sem reenvio automático.`,
          },
        });
    } catch {
      /* Keep accepted until provider delivery is confirmed. */
    }
  }
}

export async function previewRadarTestEmail() {
  const config = radarEmailConfiguration();
  if (!config.configured) return { missing: config.missing };
  const text =
    "Este é um teste de e-mail do MVP do Radar automotivo. Nenhuma coleta foi executada e nenhum crédito de anúncios foi consumido. Este teste não representa uma oportunidade real.";
  const payload: RadarEmailPayload = {
    from: setting("RADAR_EMAIL_FROM"),
    to: [resolveRadarRecipient()!],
    subject: "[TESTE MVP] Radar automotivo — validação de e-mail",
    text,
    html: `<p>${text}</p>`,
  };
  const preview = await db.radarEmailDelivery.create({
    data: {
      kind: "test",
      status: "preview",
      payload: JSON.stringify(payload),
      idempotencyKey: `radar-test/${randomUUID()}`,
    },
  });
  return { id: preview.id, ...payload, missing: [] };
}
export async function confirmRadarTestEmail(id: string) {
  // Confirm only a reviewed, unexpired snapshot. Cron never sends test previews.
  await db.radarEmailDelivery.updateMany({
    where: {
      id,
      kind: "test",
      status: "preview",
      createdAt: { gte: new Date(Date.now() - 3600000) },
    },
    data: { status: "pending" },
  });
  const row = await db.radarEmailDelivery.findUnique({ where: { id } });
  if (!row || row.kind !== "test" || row.status === "preview")
    throw new Error("Prévia inexistente ou expirada.");
  await deliverPendingRadarEmails(id);
  const result = await db.radarEmailDelivery.findUniqueOrThrow({
    where: { id },
  });
  return {
    id: result.id,
    status: result.status,
    providerId: result.providerId,
  };
}
