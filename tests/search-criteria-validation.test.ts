import { expect, it } from "vitest";
import fixture from "./fixtures/olx-local-radars.json";
import { searchSchema } from "../src/lib/discovery";
it("explains an empty source selection before any integration is called", () => {
  const result = searchSchema.safeParse({
    ...fixture.groups[1].criteria,
    sources: [],
  });
  expect(result.success).toBe(false);
  if (!result.success)
    expect(
      result.error.issues.find((i) => i.path.join(".") === "sources")?.message,
    ).toBe("Selecione ao menos uma fonte para a busca.");
});
