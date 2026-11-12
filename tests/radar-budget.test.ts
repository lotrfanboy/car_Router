import { expect, it } from "vitest";
import { scheduledWindow, scheduledCreditBlock } from "../src/lib/radar-budget";
it("keeps legacy behavior when no optional pilot policy is configured", () => {
  expect(scheduledWindow({})).toMatchObject({ allowed: true, expiresAt: null });
  expect(scheduledCreditBlock("gecko", 4, 1, {})).toBeNull();
});
it("blocks invalid or elapsed windows without extending the authorized period", () => {
  expect(scheduledWindow({ RADAR_SCHEDULED_UNTIL: "invalid" }).allowed).toBe(
    false,
  );
  const until = "2026-11-03T20:00:00.000Z";
  expect(
    scheduledWindow({ RADAR_SCHEDULED_UNTIL: until }, Date.parse(until) - 1)
      .allowed,
  ).toBe(true);
  expect(
    scheduledWindow({ RADAR_SCHEDULED_UNTIL: until }, Date.parse(until))
      .allowed,
  ).toBe(false);
});
it("enforces a cumulative ceiling including previous/manual reservations and can forbid an added provider", () => {
  const policy = {
    RADAR_SCHEDULED_GECKO_TOTAL_CREDIT_CAP: "13",
    RADAR_SCHEDULED_REEF_TOTAL_CREDIT_CAP: "2",
  };
  expect(scheduledCreditBlock("gecko", 12, 1, policy)).toBeNull();
  expect(scheduledCreditBlock("gecko", 13, 1, policy)).toContain(
    "Teto autorizado",
  );
  expect(scheduledCreditBlock("gecko", 14, 1, policy)).toContain(
    "Teto autorizado",
  );
  expect(scheduledCreditBlock("reef", 2, 1, policy)).toContain(
    "Teto autorizado",
  );
});
it("fails closed for malformed ceilings instead of removing a budget restriction", () => {
  for (const value of ["-1", "1.5", "Infinity", "invalid", "9007199254740992"])
    expect(
      scheduledCreditBlock("gecko", 0, 1, {
        RADAR_SCHEDULED_GECKO_TOTAL_CREDIT_CAP: value,
      }),
    ).toContain("inválido");
  expect(
    scheduledCreditBlock("gecko", 0, 1, {
      RADAR_SCHEDULED_GECKO_TOTAL_CREDIT_CAP: "0",
    }),
  ).toContain("Teto autorizado");
});
