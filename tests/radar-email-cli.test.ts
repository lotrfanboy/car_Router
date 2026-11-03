import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync } from "node:fs";
import path from "node:path";

const execute = promisify(execFile);
const script = path.resolve("scripts/radar-email-test.mjs");
const directory = mkdtempSync(
  path.join(process.env.RADAR_TEST_ROOT!, "email-cli-"),
);
let server: Server | undefined;
const requests: { path: string; body: unknown }[] = [];

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  requests.length = 0;
});

async function endpoint(result: unknown) {
  server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ path: request.url!, body: JSON.parse(body) });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected local server");
  return `http://127.0.0.1:${address.port}`;
}

function run(args: string[], url: string) {
  return execute(process.execPath, [script, ...args], {
    cwd: directory,
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: path.join(directory, "missing.env"),
      RADAR_APP_URL: url,
      RADAR_CRON_SECRET: "offline-only-012345678901234567890123456789",
    },
  });
}

it("creates a local preview without sending and prints the explicit confirmation command", async () => {
  const url = await endpoint({
    id: "test-preview",
    missing: [],
    subject: "[TESTE MVP]",
  });
  const { stdout } = await run([], url);
  expect(requests).toEqual([
    { path: "/api/radars/email-test", body: { action: "preview" } },
  ]);
  expect(stdout).toContain("sem envio");
  expect(stdout).toContain("--send test-preview");
});

it("checks a test through the local endpoint without requesting a send", async () => {
  const url = await endpoint({ id: "test-message", status: "delivered" });
  const { stdout } = await run(["--status", "test-message"], url);
  expect(requests).toEqual([
    {
      path: "/api/radars/email-test",
      body: { action: "status", deliveryId: "test-message" },
    },
  ]);
  expect(stdout).toContain("Entrega confirmada pelo provedor");
});

it("rejects incomplete or ambiguous arguments before making any request", async () => {
  const url = await endpoint({});
  for (const args of [
    ["--send"],
    ["--status"],
    ["--send", "one", "--retry", "two"],
    ["--typo", "one"],
  ]) {
    await expect(run(args, url)).rejects.toMatchObject({ code: 1 });
  }
  expect(requests).toEqual([]);
});

it("rejects unencrypted non-local endpoints before exposing the operator token", async () => {
  await expect(run([], "http://example.test")).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("HTTPS"),
  });
});

it("returns failure for missing server configuration even when HTTP is successful", async () => {
  const url = await endpoint({ missing: ["RESEND_API_KEY"] });
  await expect(run([], url)).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("Configuração incompleta"),
  });
  expect(requests).toHaveLength(1);
});
