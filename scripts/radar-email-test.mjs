// Server/operator use only. Preview never collects listings or sends email.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
let local = {};
try {
  local = parse(readFileSync(".env.radar.local"));
} catch {}
const setting = (key) => process.env[key] || local[key];
const sendAt = process.argv.indexOf("--send");
const retryAt = process.argv.indexOf("--retry");
const id = process.argv[(sendAt >= 0 ? sendAt : retryAt) + 1];
if ((sendAt >= 0 || retryAt >= 0) && (!id || id.startsWith("--")))
  throw new Error("Informe o ID da prévia ou da entrega pendente.");
const url = new URL(setting("RADAR_APP_URL"));
if (url.protocol !== "https:")
  throw new Error("RADAR_APP_URL precisa de HTTPS.");
const body =
  retryAt >= 0
    ? { deliveryId: id }
    : sendAt >= 0
      ? { action: "send", previewId: id, confirmed: true }
      : { action: "preview" };
const response = await fetch(
  new URL(`/api/radars/${retryAt >= 0 ? "deliver" : "email-test"}`, url),
  {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: `Bearer ${setting("RADAR_CRON_SECRET")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  },
);
if (!response.ok)
  throw new Error(
    `Radar HTTP ${response.status}. Confira a configuração no servidor.`,
  );
console.log(JSON.stringify(await response.json(), null, 2));
