import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import nativeSnapshot from "../src/data/search-catalog.json";
import reviewedFamilies from "../src/data/commercial-models.json";
import sourceObservations from "../src/data/source-model-observations.json";
import {
  commercialBrandName,
  commercialModelName,
  modelLabelKey,
} from "../src/lib/commercial-names";
import {
  commercialCatalog,
  mergeSearchCatalog,
  type NativeSearchCatalogSnapshot,
} from "../src/lib/commercial-models";
import {
  catalogSchema,
  emptyCatalog,
  resolveCatalogVehicle,
} from "../src/lib/vehicle-catalog";

const snapshot = (
  brands: NativeSearchCatalogSnapshot["brands"],
): NativeSearchCatalogSnapshot => ({
  revision: "native-complete-fixture",
  retrievedAt: "2026-10-23T00:00:00Z",
  evidence: [
    {
      id: "native-catalog",
      url: "https://example.com/catalog-fixture",
      retrievedAt: "2026-10-23T00:00:00Z",
      sha256: "a".repeat(64),
      kind: "catalog",
    },
  ],
  brands,
});
const technicalAudi = () =>
  catalogSchema.parse({
    ...emptyCatalog,
    revision: "technical-fixture",
    brands: [{ id: "audi", name: "AUDI" }],
    models: [
      "A3",
      "A3 Sedan",
      "A3 Sportback",
      "A3 Spotback",
      "A3 Cabriolet",
      "S3 Sedan",
      "RS3 Sportback",
    ].map((name, i) => ({ id: `model-${i}`, name, brandId: "audi" })),
    versions: [
      {
        id: "technical-version",
        modelId: "model-3",
        name: "Performance Black",
        engine: "2.0 - 16V",
        transmission: "DCT-7",
      },
    ],
  });

it("keeps reviewed aliases brand-scoped and unambiguous", () => {
  const owners = new Map<string, string>();
  for (const family of reviewedFamilies.families)
    for (const member of family.members) {
      const key = `${modelLabelKey(family.brand)}:${modelLabelKey(member.label)}`;
      expect(owners.get(key) ?? family.name).toBe(family.name);
      owners.set(key, family.name);
    }
  expect(commercialBrandName("Willys Overland")).toBe("WILLYS");
  for (const brand of [
    "CHANGAN",
    "CAOA CHANGAN",
    "CHERY",
    "CAOA CHERY",
    "JEEP",
    "FORD",
  ])
    expect(commercialBrandName(brand)).toBe(brand);
  for (const [brand, one, another] of [
    ["AUDI", "A3", "S3"],
    ["AUDI", "S3", "RS3"],
    ["FORD", "Ka", "Ka+"],
    ["CHEVROLET", "Onix", "Onix Plus"],
    ["TOYOTA", "Yaris", "Yaris Cross"],
    ["TOYOTA", "Yaris", "GR Yaris"],
    ["TOYOTA", "Hilux", "Hilux SW4"],
    ["RENAULT", "Duster", "Duster Oroch"],
  ])
    expect(commercialModelName(brand, one)).not.toBe(
      commercialModelName(brand, another),
    );
});

it("exposes BMW 320i once as a search model, independently of OLX descriptions", () => {
  const catalog = mergeSearchCatalog(
    emptyCatalog,
    nativeSnapshot as NativeSearchCatalogSnapshot,
  );
  const brand = catalog.brands.find((row) => row.name === "BMW")!;
  const models = catalog.models.filter(
    (row) => row.brandId === brand.id && modelLabelKey(row.name) === "320i",
  );
  expect(models).toHaveLength(1);
  expect(
    catalog.queryTargets?.filter(
      (row) =>
        row.canonicalBrandId === brand.id &&
        row.canonicalModelId === models[0].id,
    ),
  ).toHaveLength(1);
});

it.each([
  ["AUDI", "A4 Avant", "A4"],
  ["AUDI", "A5 Cabriolet", "A5"],
  ["CHEVROLET", "Cruze Sport6", "Cruze"],
  ["FORD", "Focus Fastback", "Focus"],
  ["FORD", "New Fiesta Sedan", "Fiesta"],
  ["HONDA", "CITY HATCH", "City"],
  ["TOYOTA", "Etios SD", "Etios"],
  ["TOYOTA", "YARIS SEDÃ", "Yaris"],
  ["LAND ROVER", "DEFENDER 110 D350", "Defender"],
  ["RENAULT", "Master Furgão", "Master"],
  ["FORD", "Ranger 4x4 CS / CD", "Ranger"],
  ["TOYOTA", "Hilux Flex 4X2", "Hilux"],
  ["TOYOTA", "SW4", "Hilux SW4"],
  ["RENAULT", "Duster Oroch", "Oroch"],
  ["LEXUS", "IS250 F-SPORT", "IS 250"],
  ["LEXUS", "RX350 F-SPORT", "RX 350"],
  ["CHEVROLET", "CORVETTE GRAND SPORT", "Corvette"],
])(
  "maps the reviewed %s %s into %s without generic suffix stripping",
  (brand, model, family) => {
    expect(commercialModelName(brand, model)).toBe(family);
    expect(commercialModelName(brand, `${model} Unknown`)).toBe(
      `${model} Unknown`,
    );
  },
);

it("preserves every leaf of the complete observed source tree and verifies its evidence", () => {
  const tree = nativeSnapshot as NativeSearchCatalogSnapshot;
  const body = readFileSync(
    new URL(
      "../src/data/evidence/reef-makes-models-20261023.json",
      import.meta.url,
    ),
  );
  expect(createHash("sha256").update(body).digest("hex")).toBe(
    tree.evidence[0].sha256,
  );
  const response = JSON.parse(body.toString("utf8"));
  expect(response.meta.stop_reason).toBe("complete");
  expect(response.data.make_count).toBe(136);
  expect(response.data.model_count).toBe(1261);
  const merged = mergeSearchCatalog(emptyCatalog, tree);
  expect(merged.brands).toHaveLength(135);
  expect(
    new Set(merged.queryTargets?.map((target) => target.sourceBrand)).size,
  ).toBe(136);
  expect(merged.queryTargets).toHaveLength(1261);
  expect(
    merged.queryTargets?.every(
      (target) => !target.sourceBrandId && !target.sourceModelId,
    ),
  ).toBe(true);
  const identities = new Set(
    merged.queryTargets?.map(
      (target) => `${target.sourceBrand}:${target.sourceModel}`,
    ),
  );
  for (const brand of response.data.makes)
    for (const model of brand.models)
      expect(identities.has(`${brand.make}:${model}`)).toBe(true);
  const jaguar = merged.queryTargets?.filter(
    (target) =>
      target.sourceBrand === "JAGUAR" &&
      ["XJ-S", "XJS"].includes(target.sourceModel),
  );
  expect(jaguar).toHaveLength(2);
  expect(new Set(jaguar?.map((target) => target.canonicalModelId)).size).toBe(
    1,
  );
  const willys = merged.queryTargets?.filter(
    (target) =>
      ["WILLYS", "WILLYS OVERLAND"].includes(target.sourceBrand) &&
      target.sourceModel === "JEEP",
  );
  expect(willys).toHaveLength(2);
  expect(new Set(willys?.map((target) => target.canonicalBrandId)).size).toBe(
    1,
  );
  expect(new Set(willys?.map((target) => target.canonicalModelId)).size).toBe(
    1,
  );
  expect(
    new Set(
      merged.models.map(
        (model) => `${model.brandId}:${model.name.toLocaleLowerCase()}`,
      ),
    ).size,
  ).toBe(merged.models.length);
});

it("merges every native brand/model, including the final brand and leaves absent from Inmetro", () => {
  const brands = Array.from({ length: 80 }, (_, b) => ({
    source: "webmotors" as const,
    name: `Native brand ${b}`,
    models: Array.from({ length: 25 }, (_, m) => ({ name: `Model ${m}` })),
  }));
  const tree = snapshot(brands);
  const merged = mergeSearchCatalog(emptyCatalog, tree);
  expect(merged.brands).toHaveLength(80);
  expect(merged.models).toHaveLength(2000);
  expect(merged.queryTargets).toHaveLength(2000);
  expect(merged.queryTargets?.at(-1)).toMatchObject({
    sourceBrand: "Native brand 79",
    sourceModel: "Model 24",
    status: "confirmed",
  });
  expect(merged.brands.every((brand) => brand.references.length === 0)).toBe(
    true,
  );
  expect(
    merged.queryTargets?.every(
      (target) => !target.sourceBrandId && !target.sourceModelId,
    ),
  ).toBe(true);
  expect(emptyCatalog.brands).toHaveLength(0);
  const reordered = mergeSearchCatalog(emptyCatalog, {
    ...tree,
    brands: [...brands].reverse(),
  });
  expect(reordered.models.map((model) => model.id).sort()).toEqual(
    merged.models.map((model) => model.id).sort(),
  );
  expect(mergeSearchCatalog(merged, tree)).toBe(merged);
});

it("offers one reviewed A3 family and retains every native target, technical ID and negative sibling", () => {
  const raw = technicalAudi();
  const tree = snapshot([
    {
      source: "webmotors",
      sourceId: "fixture-audi-id",
      name: "AUDI",
      models: [
        { sourceId: "fixture-sedan-id", name: "A3 SEDAN" },
        { sourceId: "fixture-sportback-id", name: "A3 SPORTBACK" },
        { name: "A3 CABRIOLET" },
        { name: "S3 SEDAN" },
        { name: "RS3 SPORTBACK" },
      ],
    },
  ]);
  const merged = mergeSearchCatalog(raw, tree);
  const a3 = merged.models.find((model) => model.name === "A3")!;
  expect(merged.models.map((model) => model.name).sort()).toEqual([
    "A3",
    "RS3",
    "S3",
  ]);
  expect(
    merged.queryTargets?.filter((target) => target.canonicalModelId === a3.id),
  ).toHaveLength(3);
  expect(
    merged.modelAliases?.find((alias) => alias.name === "A3 Spotback")?.modelId,
  ).toBe(a3.id);
  expect(merged.versions).toMatchObject([
    { id: "technical-version", modelId: a3.id },
  ]);
  expect(commercialCatalog(raw).models).toHaveLength(3);
  const byId = resolveCatalogVehicle(merged, {
    source: "webmotors",
    brand: "Incorrect label",
    brandId: "fixture-audi-id",
    model: "S3 SEDAN",
    modelId: "fixture-sedan-id",
  });
  expect(byId.model?.id).toBe(a3.id);
  expect(byId.classification).toEqual({
    model: "confirmed",
    version: "unresolved",
  });
  expect(
    resolveCatalogVehicle(merged, {
      source: "webmotors",
      brand: "AUDI",
      model: "S3 SEDAN",
    }).model?.name,
  ).toBe("S3");
  expect(
    resolveCatalogVehicle(merged, {
      source: "webmotors",
      brand: "AUDI",
      model: "RS3 SPORTBACK",
    }).model?.name,
  ).toBe("RS3");
  expect(
    resolveCatalogVehicle(merged, {
      source: "webmotors",
      brand: "AUDI",
      model: "A3 CABRIOLET",
      modelId: "unlisted-cabriolet-id",
    }).model?.id,
  ).toBe(a3.id);

  expect(
    resolveCatalogVehicle(merged, {
      source: "webmotors",
      brand: "AUDI",
      model: "A3 SPORTBACK",
      modelId: "unknown",
    }).identity?.modelId,
  ).toBeUndefined();
  expect(
    resolveCatalogVehicle(merged, {
      source: "webmotors",
      brand: "AUDI",
      brandId: "unknown",
      model: "A3 SPORTBACK",
      modelId: "fixture-sportback-id",
    }).identity?.modelId,
  ).toBeUndefined();
});

it("classifies native labels without a trim or invented source IDs and keeps unknown descriptions uncertain", () => {
  const merged = mergeSearchCatalog(
    emptyCatalog,
    snapshot([
      { source: "webmotors", name: "Example", models: [{ name: "Urban" }] },
    ]),
  );
  const resolved = resolveCatalogVehicle(merged, {
    source: "webmotors",
    brand: "Example",
    model: "URBAN",
    brandId: "unlisted-brand-id",
    modelId: "unlisted-model-id",
  });
  expect(resolved.model?.name).toBe("Urban");
  expect(resolved.classification.model).toBe("confirmed");
  expect(resolved.version).toBeUndefined();
  expect(
    resolveCatalogVehicle(merged, {
      source: "webmotors",
      brand: "Example",
      model: "Urban unknown trim description",
    }).identity?.modelId,
  ).toBeUndefined();
});

it("does not promote returned-ad mappings into outbound search permissions", () => {
  const projected = commercialCatalog(technicalAudi());
  expect(projected.queryTargets).toBeUndefined();
  const merged = mergeSearchCatalog(
    projected,
    snapshot([
      { source: "webmotors", name: "AUDI", models: [{ name: "A3 SEDAN" }] },
    ]),
  );
  expect(merged.queryTargets).toHaveLength(1);
  expect(merged.queryTargets?.[0].sourceModel).toBe("A3 SEDAN");
});

it("applies observed source labels to native-only fallback parents without duplicating them on refresh", () => {
  const tree = nativeSnapshot as NativeSearchCatalogSnapshot;
  const merged = mergeSearchCatalog(emptyCatalog, tree);
  const celta = sourceObservations.observations.find(
    (row) => row.source === "olx" && row.commercialModel === "Celta",
  )!;
  const resolved = resolveCatalogVehicle(merged, {
    source: "olx",
    brand: celta.brand,
    model: celta.model,
  });
  expect(modelLabelKey(resolved.model?.name ?? "")).toBe("celta");
  expect(resolved.classification).toEqual({
    model: "confirmed",
    version: "unresolved",
  });
  const evidenceId = `portal-model:olx:${celta.externalId}`;
  expect(merged.mappings.filter((row) => row.id === evidenceId)).toHaveLength(
    1,
  );
  expect(merged.evidence.filter((row) => row.id === evidenceId)).toHaveLength(
    1,
  );
  const refreshed = mergeSearchCatalog(merged, {
    ...tree,
    revision: `${tree.revision}-refresh`,
  });
  expect(refreshed.mappings).toEqual(merged.mappings);
  expect(refreshed.evidence).toEqual(merged.evidence);
  expect(refreshed.brands).toEqual(merged.brands);
  expect(refreshed.queryTargets).toEqual(merged.queryTargets);
  expect(
    mergeSearchCatalog(refreshed, {
      ...tree,
      revision: refreshed.searchRevision!,
    }),
  ).toBe(refreshed);
});

it("deduplicates repeated source rows and rejects target evidence, parent and identity conflicts", () => {
  const merged = mergeSearchCatalog(
    emptyCatalog,
    snapshot([
      {
        source: "webmotors",
        name: "Example",
        models: [{ name: "Urban" }, { name: "URBAN" }],
      },
    ]),
  );
  expect(merged.models).toHaveLength(1);
  expect(merged.queryTargets).toHaveLength(1);
  const target = merged.queryTargets![0];
  for (const queryTargets of [
    [{ ...target, evidenceId: "missing" }],
    [{ ...target, canonicalBrandId: "missing" }],
    [{ ...target, canonicalModelId: "missing" }],
    [target, { ...target, id: "other" }],
  ])
    expect(catalogSchema.safeParse({ ...merged, queryTargets }).success).toBe(
      false,
    );
});
