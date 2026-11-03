// Server/operator use only. Preview and status never send email or collect listings.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
let local = {};
try {
  local = parse(readFileSync(".env.radar.local"));
} catch {}
const setting = (key) => process.env[key] || local[key];
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log(`Teste de e-mail independente dos radares:
  node scripts/radar-email-test.mjs              Cria uma prévia; não envia.
  node scripts/radar-email-test.mjs --send ID    Envia a prévia após sua confirmação.
  node scripts/radar-email-test.mjs --status ID  Consulta a entrega do teste; não reenvia.
  node scripts/radar-email-test.mjs --retry ID   Repete somente uma entrega de resumo elegível.

Configure RADAR_APP_URL e RADAR_CRON_SECRET no ambiente ou em .env.radar.local.
Use HTTPS; HTTP é permitido somente para localhost, 127.0.0.1 ou [::1].
Remetente, destinatário e chave Resend são lidos pelo servidor do aplicativo.`);
  process.exit(0);
}
const [mode, id] = args;
if (
  args.length &&
  (args.length !== 2 ||
    !["--send", "--status", "--retry"].includes(mode) ||
    !id?.trim() ||
    id.startsWith("--"))
)
  throw new Error("Use --send ID, --status ID ou --retry ID. Consulte --help.");
if (!setting("RADAR_APP_URL"))
  throw new Error(
    "Configure RADAR_APP_URL para apontar ao aplicativo que deseja testar.",
  );
const url = new URL(setting("RADAR_APP_URL"));
const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
if (
  url.username ||
  url.password ||
  (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
)
  throw new Error(
    "RADAR_APP_URL precisa de HTTPS, ou HTTP somente no endereço local do aplicativo.",
  );
if ((setting("RADAR_CRON_SECRET") ?? "").length < 32)
  throw new Error(
    "Configure RADAR_CRON_SECRET com ao menos 32 caracteres, igual ao do servidor.",
  );
const body =
  mode === "--retry"
    ? { deliveryId: id }
    : mode === "--status"
      ? { action: "status", deliveryId: id }
      : mode === "--send"
        ? { action: "send", previewId: id, confirmed: true }
        : { action: "preview" };
const response = await fetch(
  new URL(`/api/radars/${mode === "--retry" ? "deliver" : "email-test"}`, url),
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
if (!response.ok) {
  if (response.status === 401)
    throw new Error(
      "Não autorizado. Confira RADAR_CRON_SECRET no cliente e no servidor.",
    );
  if (response.status === 409)
    throw new Error(
      "Prévia inexistente ou expirada. Gere e revise uma nova prévia antes de enviar.",
    );
  if (response.status === 404)
    throw new Error(
      "Teste ou entrega não encontrado. Confira o ID e o aplicativo configurado.",
    );
  throw new Error(
    `Radar HTTP ${response.status}. Confira a configuração no servidor.`,
  );
}
const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (result.missing?.length) {
  console.error(
    "Configuração incompleta no servidor. Nenhum teste foi enviado.",
  );
  process.exitCode = 1;
} else if (!mode && result.id) {
  console.log(`Prévia criada, sem envio. Confira remetente, destinatário, assunto e conteúdo acima.
Após confirmar o envio, execute: node scripts/radar-email-test.mjs --send ${result.id}`);
} else if (result.status === "accepted") {
  console.log("Aceito pelo provedor; entrega ainda não confirmada.");
  console.log(
    mode === "--retry"
      ? "Confira a entrega na tela de radares ou no painel do provedor."
      : `Consulte: node scripts/radar-email-test.mjs --status ${result.id}`,
  );
} else if (result.status === "delivered") {
  console.log(
    "Entrega confirmada pelo provedor. Confira também a caixa de entrada e o spam.",
  );
} else if (["failed", "unknown", "expired"].includes(result.status)) {
  console.error(
    "Entrega não confirmada. Revise a situação antes de qualquer novo envio.",
  );
  process.exitCode = 1;
}
