export type TechnicalInput = {
  version?: string | null;
  engine?: string | null;
  transmission?: string | null;
  fuel?: string | null;
};
export type TechnicalFacts = {
  engine: string | null;
  transmission: string | null;
  fuel: string | null;
  origins: Partial<
    Record<"engine" | "transmission" | "fuel", "source" | "version">
  >;
  conflicts: string[];
};
const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
/** Display-only extraction from literal version tokens; never changes identity or matching. */
export function technicalFacts(input: TechnicalInput): TechnicalFacts {
  const version = normalized(input.version ?? "");
  const unique = (values: string[]) => {
    const candidates = [...new Set(values)];
    return candidates.length === 1 ? candidates[0] : null;
  };
  const engine = unique(
    [...version.matchAll(/\b([0-8][.,][0-9])(?:\s+(TSI|TFSI|MPI|FSI))?\b/g)]
      .filter((m) => +m[1].replace(",", ".") >= 0.6)
      .map((m) => [m[1].replace(",", "."), m[2]].filter(Boolean).join(" ")),
  );
  const fuel = unique(
    [
      [/\bFLEX\b/, "Flex"],
      [/\bGASOLINA\b/, "Gasolina"],
      [/\bETANOL\b/, "Etanol"],
      [/\bDIESEL\b/, "Diesel"],
      [/\bELETRICO\b/, "Elétrico"],
      [/\bHIBRIDO\b/, "Híbrido"],
      [/\bGNV\b/, "GNV"],
    ].flatMap(([regex, label]) =>
      (regex as RegExp).test(version) ? [label as string] : [],
    ),
  );
  const transmission = unique(
    [
      [/\bMANUAL\b/, "Manual"],
      [/\bAUTOMATIC[OA]\b/, "Automático"],
      [/\bAUTOMATIZAD[OA]\b/, "Automatizado"],
      [/\bCVT\b/, "CVT"],
      [/\bDSG\b/, "DSG"],
      [/\bDCT\b/, "DCT"],
    ].flatMap(([regex, label]) =>
      (regex as RegExp).test(version) ? [label as string] : [],
    ),
  );
  const result: TechnicalFacts = {
    engine: null,
    transmission: null,
    fuel: null,
    origins: {},
    conflicts: [],
  };
  for (const key of ["engine", "transmission", "fuel"] as const) {
    const explicit = input[key]?.trim();
    const extracted = { engine, transmission, fuel }[key];
    if (explicit) {
      result[key] = explicit;
      result.origins[key] = "source";
      if (
        extracted &&
        normalized(explicit) !== normalized(extracted) &&
        !normalized(explicit).includes(normalized(extracted)) &&
        !normalized(extracted).includes(normalized(explicit))
      )
        result.conflicts.push(key);
    } else if (extracted) {
      result[key] = extracted;
      result.origins[key] = "version";
    }
  }
  return result;
}
