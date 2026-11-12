import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
const execute = promisify(execFile);
const script = path.resolve("scripts/radar-tick.mjs");
let server: Server | undefined;
const calls: { path: string; authorization: string | undefined }[] = [];
const fakeSecret = "offline-cli-only-0000000000000000000000000000";
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  calls.length = 0;
});
async function endpoint(status = 200) {
  server = createServer((request, response) => {
    calls.push({
      path: request.url!,
      authorization: request.headers.authorization,
    });
    response.writeHead(status);
    response.end("{}");
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Local server absent");
  return `http://127.0.0.1:${address.port}`;
}
function run(
  args: string[],
  url: string,
  options: { fromFile?: boolean; enabled?: boolean; secret?: string } = {},
) {
  const cwd = mkdtempSync(path.join(process.env.RADAR_TEST_ROOT!, "tick-cli-"));
  const env = { ...process.env };
  for (const key of [
    "RADAR_APP_URL",
    "RADAR_CRON_SECRET",
    "RADAR_SCHEDULER_ENABLED",
    "RADAR_EMAIL_ENABLED",
    "DOTENV_CONFIG_PATH",
  ])
    delete env[key];
  const values = {
    RADAR_APP_URL: url,
    RADAR_CRON_SECRET: options.secret ?? fakeSecret,
    RADAR_SCHEDULER_ENABLED: options.enabled === false ? "false" : "true",
    RADAR_EMAIL_ENABLED: "false",
  };
  if (options.fromFile)
    writeFileSync(
      path.join(cwd, ".env"),
      Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    );
  else Object.assign(env, values);
  return execute(process.execPath, [script, ...args], { cwd, env });
}
it("loads the user's usual .env for a server-side tick without copying secrets into another file", async () => {
  const url = await endpoint();
  const { stdout } = await run([], url, { fromFile: true });
  expect(stdout).toContain("HTTP 200");
  expect(stdout).not.toContain(fakeSecret);
  expect(calls).toEqual([
    { path: "/api/radars/tick", authorization: `Bearer ${fakeSecret}` },
  ]);
});
it("checks configuration without a single HTTP request, collection or email", async () => {
  const url = await endpoint();
  const { stdout } = await run(["--check"], url, { fromFile: true });
  expect(JSON.parse(stdout)).toMatchObject({
    checkOnly: true,
    httpRequests: 0,
    appTarget: "loopback",
    secretConfigured: true,
    schedulerEnabled: true,
    emailEnabled: false,
    ready: true,
  });
  expect(stdout).not.toContain(fakeSecret);
  expect(calls).toEqual([]);
});
it("reports disabled scheduling honestly and does not call the endpoint", async () => {
  const url = await endpoint();
  await expect(run(["--check"], url, { enabled: false })).rejects.toMatchObject(
    { code: 1, stdout: expect.stringContaining('"schedulerEnabled": false') },
  );
  expect(calls).toEqual([]);
});
it("rejects unknown arguments, short secrets and unsafe URLs before forwarding authorization", async () => {
  const url = await endpoint();
  await expect(run(["--typo"], url)).rejects.toMatchObject({ code: 1 });
  await expect(run([], url, { secret: "short" })).rejects.toMatchObject({
    code: 1,
  });
  for (const target of [
    "http://example.test",
    "https://user:password@example.test",
    "https://example.test/?token=hidden",
    "https://example.test/base",
  ])
    await expect(run([], target)).rejects.toMatchObject({ code: 1 });
  expect(calls).toEqual([]);
});
it("does not automatically retry an unsuccessful scheduler request", async () => {
  const url = await endpoint(503);
  await expect(run([], url)).rejects.toMatchObject({
    code: 1,
    stdout: expect.stringContaining("HTTP 503"),
  });
  expect(calls).toHaveLength(1);
});
