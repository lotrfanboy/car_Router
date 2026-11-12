import { describe, expect, it } from "vitest";
import { technicalFacts } from "../src/lib/technical-facts";
describe("literal technical evidence", () => {
  it("extracts the exact displacement, engine label, fuel and gearbox written in a version", () => {
    expect(
      technicalFacts({ version: "1.0 TSI HIGH UP 12V FLEX 4P MANUAL" }),
    ).toMatchObject({
      engine: "1.0 TSI",
      transmission: "Manual",
      fuel: "Flex",
      origins: { engine: "version", fuel: "version", transmission: "version" },
    });
  });
  it("does not guess an engine from a model number or marketing badge", () => {
    expect(technicalFacts({ version: "320i SPORT GP" }).engine).toBeNull();
    expect(technicalFacts({ version: "C180 Avantgarde" }).engine).toBeNull();
  });
  it("leaves alternatives and contradictory descriptions unknown", () => {
    const facts = technicalFacts({
      version: "1.0 / 1.4 GASOLINA DIESEL MANUAL AUTOMÁTICO",
    });
    expect(facts.engine).toBeNull();
    expect(facts.fuel).toBeNull();
    expect(facts.transmission).toBeNull();
  });
  it("preserves explicit source values and exposes conflicting literal version evidence", () => {
    expect(
      technicalFacts({
        version: "1.0 FLEX MANUAL",
        engine: "2.0",
        fuel: "Gasolina",
        transmission: "Automático",
      }),
    ).toMatchObject({
      engine: "2.0",
      fuel: "Gasolina",
      transmission: "Automático",
      conflicts: ["engine", "transmission", "fuel"],
    });
  });
  it("does not invent power, aspiration or gearbox expansion", () => {
    expect(technicalFacts({ version: "2.0 DSG" })).toMatchObject({
      engine: "2.0",
      transmission: "DSG",
      fuel: null,
    });
    expect(
      technicalFacts({ version: "Highline AUT. Tip." }).transmission,
    ).toBeNull();
  });
  it("handles a literal decimal comma and duplicate identical evidence", () => {
    expect(
      technicalFacts({ version: "1,6 FLEX 1,6 FLEX MANUAL" }),
    ).toMatchObject({ engine: "1.6", fuel: "Flex", transmission: "Manual" });
  });
});
