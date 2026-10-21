// Invoke from a server-side cron. Never scheduled by the browser.
import { existsSync } from "node:fs";
if (existsSync(".env.radar.local")) process.loadEnvFile(".env.radar.local");
const { RADAR_APP_URL, RADAR_CRON_SECRET } = process.env;
if (!RADAR_APP_URL || !RADAR_CRON_SECRET)
  throw new Error("Configure RADAR_APP_URL e RADAR_CRON_SECRET no agendador.");
try {
  const response = await fetch(
    `${RADAR_APP_URL.replace(/\/$/, "")}/api/radars/tick`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${RADAR_CRON_SECRET}` },
      signal: AbortSignal.timeout(900000),
      redirect: "error",
    },
  );
  console.log(`Radar scheduler: HTTP ${response.status}`);
  if (!response.ok) process.exitCode = 1;
} catch {
  console.error(
    "Radar scheduler: execução não confirmada. Sem repetição automática.",
  );
  process.exitCode = 1;
}
