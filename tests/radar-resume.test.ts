import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  save: vi.fn(),
  infra: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({ db: { radar: { findUnique: mocks.find } } }));
vi.mock("../src/lib/radar", () => ({
  saveRadar: mocks.save,
  listRadars: vi.fn(),
  radarInfrastructure: mocks.infra,
}));
vi.mock("../src/lib/discovery-store", () => ({
  SearchError: class extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));
import { resumeRadar } from "../src/lib/radar-preferences";
afterEach(() => vi.resetAllMocks());
it("leaves disabled infrastructure paused with no writes", async () => {
  mocks.find.mockResolvedValue({
    id: "qa",
    enabled: false,
    runsRemaining: 1,
    channel: "email",
  });
  mocks.infra.mockReturnValue({ ready: false, missing: ["disabled"] });
  await expect(resumeRadar("qa")).rejects.toMatchObject({ status: 409 });
  expect(mocks.save).not.toHaveBeenCalled();
});
it("does not grant unlimited or depleted allowance", async () => {
  mocks.infra.mockReturnValue({ ready: true, missing: [], email: true });
  for (const allowance of [null, 0]) {
    mocks.find.mockResolvedValue({
      id: "qa",
      enabled: false,
      runsRemaining: allowance,
      channel: "email",
    });
    await expect(resumeRadar("qa")).rejects.toMatchObject({ status: 409 });
  }
  expect(mocks.save).not.toHaveBeenCalled();
});
it("requires the email channel when that is the requested delivery", async () => {
  mocks.find.mockResolvedValue({
    id: "qa",
    enabled: false,
    runsRemaining: 1,
    channel: "both",
  });
  mocks.infra.mockReturnValue({ ready: true, missing: [], email: false });
  await expect(resumeRadar("qa")).rejects.toMatchObject({ status: 409 });
  expect(mocks.save).not.toHaveBeenCalled();
});
it("resumes only the existing bounded allowance", async () => {
  mocks.find.mockResolvedValue({
    id: "qa",
    enabled: false,
    runsRemaining: 1,
    channel: "both",
  });
  mocks.infra.mockReturnValue({ ready: true, missing: [], email: true });
  await resumeRadar("qa");
  expect(mocks.save).toHaveBeenCalledWith(
    { id: "qa", enabled: true, runsRemaining: 1, channel: "both" },
    "qa",
  );
});
