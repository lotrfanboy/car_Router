import { afterEach, describe, expect, it, vi } from "vitest";
import { radarAppUrl } from "../src/lib/radar-app-url";

vi.mock("../src/lib/db", () => ({ db: {} }));
afterEach(() => vi.unstubAllEnvs());

describe("Radar application links", () => {
  it("keeps HTTPS available for hosted and local databases", () => {
    expect(radarAppUrl("https://app.example.test", "postgresql://test")).toBe(
      "https://app.example.test/",
    );
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "allows HTTP on %s only with local SQLite",
    (host) => {
      expect(radarAppUrl(`http://${host}:3000`, "file:local.db")).toBe(
        `http://${host}:3000/`,
      );
      expect(
        radarAppUrl(`http://${host}:3000`, "postgresql://test"),
      ).toBeNull();
    },
  );

  it.each([
    "http://app.example.test",
    "http://localhost.example.test",
    "http://127.0.0.1.example.test",
    "http://user:password@localhost:3000",
    "https://user:password@app.example.test",
    "file:///tmp/app",
    "not a URL",
  ])("rejects unsafe application URL %s", (url) => {
    expect(radarAppUrl(url, "file:local.db")).toBeNull();
  });

  it("does not allow HTTP without evidence of a local database", () => {
    expect(radarAppUrl("http://127.0.0.1:3000", "")).toBeNull();
  });

  it("uses the same local URL rule for radar readiness and digest links", async () => {
    vi.stubEnv("DATABASE_URL", "file:isolated-test.db");
    vi.stubEnv("RADAR_APP_URL", "http://127.0.0.1:3000");
    vi.stubEnv("RADAR_SCHEDULER_ENABLED", "true");
    vi.stubEnv("RADAR_CRON_SECRET", "test-only-000000000000000000000000000000");
    vi.stubEnv("RADAR_EMAIL_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "test-only");
    vi.stubEnv("RADAR_EMAIL_FROM", "radar@example.test");
    vi.stubEnv("RADAR_EMAIL_TO", "owner@example.test");
    const { radarInfrastructure } = await import("../src/lib/radar");
    const { buildRadarEmail } = await import("../src/lib/radar-email");
    expect(radarInfrastructure().ready).toBe(true);
    expect(buildRadarEmail("Local test", "test-id", []).text).toContain(
      "http://127.0.0.1:3000/radares/test-id",
    );
    vi.stubEnv("DATABASE_URL", "postgresql://test");
    expect(radarInfrastructure().link).toBe(false);
    expect(() => buildRadarEmail("Local test", "test-id", [])).toThrow("HTTPS");
  });
});

it("distinguishes a disabled scheduler from a missing operator secret", async () => {
  vi.stubEnv("DATABASE_URL", "file:isolated-test.db");
  vi.stubEnv("RADAR_APP_URL", "http://127.0.0.1:3000");
  vi.stubEnv("RADAR_CRON_SECRET", "offline-only-00000000000000000000000000");
  vi.stubEnv("RADAR_SCHEDULER_ENABLED", "false");
  const { radarInfrastructure } = await import("../src/lib/radar");
  expect(radarInfrastructure()).toMatchObject({
    scheduler: false,
    schedulerEnabled: false,
    cronConfigured: true,
  });
  expect(radarInfrastructure().missing.join(" ")).not.toContain(
    "RADAR_CRON_SECRET",
  );
  vi.stubEnv("RADAR_CRON_SECRET", "short");
  vi.stubEnv("RADAR_SCHEDULER_ENABLED", "true");
  expect(radarInfrastructure()).toMatchObject({
    scheduler: false,
    schedulerEnabled: true,
    cronConfigured: false,
  });
});
