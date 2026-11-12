import { describe, expect, it } from "vitest";
import { overviewSources } from "../src/lib/workspace-overview";
describe("stored source status is not live availability", () => {
  it("returns a latest failed consultation instead of masking it with an older success", () => {
    const run = (date: string, status: string) => ({
      createdAt: date,
      result: JSON.stringify({
        sources: [
          {
            source: "olx",
            status,
            observedAt: date,
            partial: true,
            listings: [],
          },
        ],
      }),
    });
    expect(
      overviewSources([
        run("2026-11-03T12:00:00Z", "ok"),
        run("2026-11-04T12:00:00Z", "error"),
      ]),
    ).toEqual([
      {
        source: "olx",
        status: "error",
        observedAt: "2026-11-04T12:00:00Z",
        received: 0,
        partial: true,
      },
    ]);
  });
  it("does not invent a configured or successful state for malformed or absent records", () => {
    expect(
      overviewSources([
        { createdAt: new Date(), result: "bad-json" },
        {
          createdAt: new Date(),
          result: JSON.stringify({
            sources: [{ source: "unknown", status: "ok" }],
          }),
        },
      ]),
    ).toEqual([]);
  });
  it("uses a known run date when the provider omitted its date and preserves partial coverage", () => {
    expect(
      overviewSources([
        {
          createdAt: "2026-11-04T10:00:00Z",
          result: JSON.stringify({
            sources: [
              {
                source: "webmotors",
                status: "ok",
                received: 12,
                partial: true,
              },
            ],
          }),
        },
      ])[0],
    ).toMatchObject({
      observedAt: "2026-11-04T10:00:00.000Z",
      received: 12,
      partial: true,
    });
  });
});
