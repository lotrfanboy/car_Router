// Server/operator entry point. Scheduling remains an explicit platform action.
import { existsSync } from "node:fs";
import { config } from "dotenv";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log(`Radar scheduler:
  node scripts/radar-tick.mjs --check  Verifica configuração local, sem HTTP, coleta ou envio.
  node scripts/radar-tick.mjs          Solicita um ciclo ao servidor; pode consumir créditos/enviar resumos.

Execute na pasta do projeto. O comando lê .env e complementa com .env.radar.local,
sem substituir variáveis já definidas no processo. Não instala agendador.`);
  process.exit(0);
}
if (args.length && !(args.length === 1 && args[0] === "--check"))
  throw new Error("Argumentos inválidos. Consulte --help.");
config({
  quiet: true,
  ...(process.env.DOTENV_CONFIG_PATH
    ? { path: process.env.DOTENV_CONFIG_PATH }
    : {}),
});
if (existsSync(".env.radar.local"))
  config({ path: ".env.radar.local", quiet: true });
const secret = process.env.RADAR_CRON_SECRET ?? "";
let target;
try {
  const url = new URL(process.env.RADAR_APP_URL ?? "");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  )
    throw Error();
  target = {
    endpoint: new URL("/api/radars/tick", url),
    kind: loopback ? "loopback" : "https",
  };
} catch {
  /* Report configuration failure without printing a possibly sensitive URL. */
}
const missing = [
  ...(!target
    ? [
        "RADAR_APP_URL: HTTPS, ou HTTP de loopback, sem credenciais/parâmetros/caminho",
      ]
    : []),
  ...(secret.length < 32 ? ["RADAR_CRON_SECRET: mínimo de 32 caracteres"] : []),
];
if (args[0] === "--check") {
  const schedulerEnabled = process.env.RADAR_SCHEDULER_ENABLED === "true";
  console.log(
    JSON.stringify(
      {
        checkOnly: true,
        httpRequests: 0,
        appTarget: target?.kind ?? null,
        secretConfigured: secret.length >= 32,
        schedulerEnabled,
        emailEnabled: process.env.RADAR_EMAIL_ENABLED === "true",
        ready: missing.length === 0 && schedulerEnabled,
        missing,
        note: "Verificação do ambiente deste comando. A API confirma heartbeat, cotas e fontes; nenhuma rotina foi ativada.",
      },
      null,
      2,
    ),
  );
  if (missing.length || !schedulerEnabled) process.exitCode = 1;
} else {
  if (missing.length) throw new Error(missing.join("; "));
  try {
    const response = await fetch(target.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(900000),
      redirect: "error",
    });
    console.log(`Radar scheduler: HTTP ${response.status}`);
    if (!response.ok) process.exitCode = 1;
  } catch {
    console.error(
      "Radar scheduler: execução não confirmada. Sem repetição automática.",
    );
    process.exitCode = 1;
  }
}
