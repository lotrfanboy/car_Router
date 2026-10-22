import { expect, it } from "vitest";
import { radarState } from "../src/lib/radar-state";

it("distinguishes saved, scheduled, running, successful, and failed radar states", () => {
  const now = Date.UTC(2026, 9, 22);
  const base = { enabled: true, ready: true, schedulerSeen: true, connected: true, now };
  expect(radarState({ ...base, ready: false })).toBe("pending");
  expect(radarState(base)).toBe("scheduled");
  expect(radarState({ ...base, latest: { status: "running", startedAt: new Date(now - 60_000) } })).toBe("running");
  expect(radarState({ ...base, latest: { status: "ok", startedAt: new Date(now - 60_000) } })).toBe("success");
  expect(radarState({ ...base, latest: { status: "error", startedAt: new Date(now - 60_000) } })).toBe("error");
  expect(radarState({ ...base, enabled: false })).toBe("paused");
});
