import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/search-options/route";
import {
  catalogBrandSearchName,
  catalogModelFamily,
  parseCatalogBrands,
  parseCatalogModels,
  parseCatalogCities,
  parseCatalogYears,
} from "../src/lib/vehicle-catalog";

afterEach(() => vi.unstubAllGlobals());

// Source-shaped fixtures, not a bundled catalog or proof of a live connection.
const volkswagen = {
  modelos: [
    { codigo: 6601, nome: "Golf Highline 1.4 TSI 140cv Aut." },
    { codigo: 6600, nome: "Golf GTi 2.0 TSI 220cv Aut." },
    { codigo: 8372, nome: "Golf Variant Comf. 250 1.4 TSI Flex Aut." },
    { codigo: 2472, nome: "New Beetle 2.0 Mi Mec./Aut." },
  ],
};
const request = (query: string) =>
  new NextRequest(`http://localhost/api/search-options?${query}`);

describe("catalog identity and query families", () => {
  it("retains brand identities and exposes query aliases separately", () => {
    expect(
      parseCatalogBrands([
        { codigo: "59", nome: "VW - VolksWagen" },
        { codigo: "23", nome: "GM - Chevrolet" },
        { codigo: 25, nome: "Honda" },
      ]),
    ).toEqual([
      { code: "23", name: "GM - Chevrolet", searchName: "Chevrolet" },
      { code: "25", name: "Honda", searchName: "Honda" },
      { code: "59", name: "VW - VolksWagen", searchName: "Volkswagen" },
    ]);
    expect(catalogBrandSearchName("Mercedes")).toBe("Mercedes-Benz");
    expect(catalogBrandSearchName("Mercedes-Benz")).toBe("Mercedes-Benz");
    expect(catalogBrandSearchName("VW")).toBe("Volkswagen");
    expect(catalogBrandSearchName("Volkswagen")).toBe("Volkswagen");
    expect(catalogBrandSearchName("Kia Motors")).toBe("Kia");
    expect(catalogBrandSearchName("An unknown brand")).toBe("An unknown brand");
  });

  it("derives only returned families, retaining every complete FIPE identity", () => {
    expect(parseCatalogModels(volkswagen)).toEqual([
      {
        code: "family:golf",
        name: "Golf",
        searchName: "Golf",
        versions: [volkswagen.modelos[1], volkswagen.modelos[0]].map((v) => ({
          code: String(v.codigo),
          name: v.nome,
        })),
      },
      {
        code: "family:golf variant",
        name: "Golf Variant",
        searchName: "Golf Variant",
        versions: [{ code: "8372", name: volkswagen.modelos[2].nome }],
      },
      {
        code: "family:new beetle",
        name: "New Beetle",
        searchName: "New Beetle",
        versions: [{ code: "2472", name: volkswagen.modelos[3].nome }],
      },
    ]);
  });

  it("derives selectable years and the versions available in each year", () => {
    expect(
      parseCatalogYears([
        {
          model: { code: "1", name: "C 180 CGI Avantgarde" },
          value: [
            { codigo: "2020-1", nome: "2020 Gasolina" },
            { codigo: "2019-1", nome: "2019 Gasolina" },
          ],
        },
        {
          model: { code: "2", name: "C 180 Exclusive" },
          value: [{ codigo: "2020-1", nome: "2020 Gasolina" }],
        },
      ]),
    ).toEqual([
      {
        code: "2020",
        name: "2020",
        versions: [
          { code: "1", name: "C 180 CGI Avantgarde" },
          { code: "2", name: "C 180 Exclusive" },
        ],
      },
      {
        code: "2019",
        name: "2019",
        versions: [{ code: "1", name: "C 180 CGI Avantgarde" }],
      },
    ]);
  });

  it("coalesces known C180 spelling aliases without discarding trims or their identities", () => {
    const modelos = [
      { codigo: 1, nome: "C 180 CGI Avantgarde 1.6 Aut." },
      { codigo: 2, nome: "C-180 Exclusive 1.6 Aut." },
      { codigo: 3, nome: "C180 Kompressor 1.8 Aut." },
      { codigo: 4, nome: "C 200 Avantgarde 2.0 Aut." },
    ];
    const result = parseCatalogModels({ modelos });
    expect(result).toHaveLength(2);
    const family = result.find((item) => item.searchName === "C180")!;
    expect(family).toMatchObject({ code: "family:c180", name: "C 180" });
    expect(family.versions).toHaveLength(3);
    for (const original of modelos.slice(0, 3))
      expect(family.versions).toContainEqual({
        code: String(original.codigo),
        name: original.nome,
      });
    expect(result.find((item) => item.searchName === "C 200")).toBeDefined();
  });

  it("keeps explicit Mercedes body families separate and retains their original records", () => {
    const modelos = [
      { codigo: 1, nome: "C 180 CGI Avantgarde 1.6 Aut." },
      { codigo: 2, nome: "C 180 Coupé 1.6 Aut." },
      { codigo: 3, nome: "C-180 Coupe CGI Avantgarde 1.6 Aut." },
      { codigo: 4, nome: "C180 Cabriolet 1.6 Aut." },
      { codigo: 5, nome: "C 180 Touring 1.6 Aut." },
      { codigo: 6, nome: "C-180 SW 1.6 Aut." },
      { codigo: 7, nome: "C 180 CGI Coupé 1.8 Aut." },
    ];
    const groups = parseCatalogModels({ modelos });
    expect(groups.map((group) => group.code).sort()).toEqual([
      "family:c180",
      "family:c180 cabriolet",
      "family:c180 cgi coupe",
      "family:c180 coupe",
      "family:c180 sw",
      "family:c180 touring",
    ]);
    expect(
      groups
        .find((group) => group.code === "family:c180 coupe")
        ?.versions.map((item) => item.code)
        .sort(),
    ).toEqual(["2", "3"]);
    expect(
      groups
        .find((group) => group.code === "family:c180")
        ?.versions.map((item) => item.code),
    ).toEqual(["1"]);
    expect(
      groups.find((group) => group.code === "family:c180 coupe")?.searchName,
    ).toBe("C180 Coupé");
    for (const original of modelos)
      expect(groups.flatMap((group) => group.versions)).toContainEqual({
        code: String(original.codigo),
        name: original.nome,
      });
  });

  it.each([
    ["Corolla XEi 2.0 Flex 16V Aut.", "Corolla"],
    ["Corolla Altis 2.0 Flex 16V Aut.", "Corolla"],
    ["COROLLA ALTIS HYBRID PREMIUM 1.8", "COROLLA"],
    ["Corolla Cross XRE 2.0 16V Flex Aut.", "Corolla Cross"],
    ["Corolla Fielder 1.8 16V", "Corolla Fielder"],
    ["Civic Touring 1.5 Turbo 16V Aut.", "Civic"],
    ["CIVIC SI 2.0 16V", "CIVIC"],
    ["Civic Type R 2.0 Turbo", "Civic"],
    ["HB20 Comfort Plus 1.0 Flex 12V", "HB20"],
    ["HB20S Comfort Plus 1.0 Flex", "HB20S"],
    ["320i Touring 2.0", "320i Touring"],
    ["Onix Plus LT 1.0 Turbo", "Onix Plus"],
    ["Onix LT 1.0", "Onix"],
    ["Grand Cherokee Limited 3.0", "Grand Cherokee"],
    ["Grand Vitara 2.0", "Grand Vitara"],
    ["Range Rover Sport 3.0", "Range Rover Sport"],
    ["Range Rover Evoque 2.0", "Range Rover Evoque"],
    ["C 180 CGI Avantgarde 1.6", "C 180"],
    ["C180 Avantgarde 1.6", "C180"],
    ["C 180 Coupé CGI Avantgarde 1.6", "C 180 Coupé"],
    ["C180 Coupe CGI Avantgarde 1.6", "C180 Coupe"],
    ["C-180 Cabriolet Avantgarde 1.6", "C-180 Cabriolet"],
    ["C180 Touring Avantgarde 1.6", "C180 Touring"],
    ["C 180 SW Avantgarde 1.6", "C 180 SW"],
    ["C-180 CGI Coupe 1.8", "C-180 CGI Coupe"],
    ["C-180 Exclusive 1.6", "C-180"],
    ["C 200 Kompressor 1.8", "C 200"],
    ["GLA 200 Advance 1.6", "GLA 200"],
    ["AMAROK CD2.0 16V/S CD2.0 16V TDI 4x2 Die", "AMAROK"],
    ["Gol (novo) 1.0 Mi Total Flex", "Gol"],
    ["Fox Highline1.6 Flex 16V", "Fox"],
    ["Model 3 Long Range", "Model 3 Long Range"],
    ["Future Compound Name 2.0", "Future Compound Name"],
    ["207 SW 1.6", "207 SW"],
  ])(
    "derives %s without merging distinct compound identities",
    (name, expected) => {
      expect(catalogModelFamily(name)).toBe(expected);
      expect(name.startsWith(catalogModelFamily(name))).toBe(true);
    },
  );

  it("keeps broad model queries independent of trim choices", () => {
    const models = parseCatalogModels({
      modelos: [
        { codigo: 1, nome: "Corolla XEi 2.0 Flex 16V Aut." },
        { codigo: 2, nome: "Corolla Altis Hybrid Premium 1.8" },
        { codigo: 3, nome: "Corolla Cross XRE 2.0" },
        { codigo: 4, nome: "Civic Touring 1.5 Turbo" },
        { codigo: 5, nome: "Civic Si 2.0" },
        { codigo: 6, nome: "Civic Type R 2.0 Turbo" },
      ],
    });
    expect(models.map((model) => model.name)).toEqual([
      "Civic",
      "Corolla",
      "Corolla Cross",
    ]);
    expect(
      models.find((model) => model.name === "Civic")?.versions,
    ).toHaveLength(3);
    expect(
      models.find((model) => model.name === "Corolla")?.versions,
    ).toHaveLength(2);
  });

  it("does not mask malformed or empty responses as a successful empty catalog", () => {
    for (const value of [
      null,
      {},
      [],
      { nome: "Volkswagen" },
      [{ codigo: "bad", nome: "Volkswagen" }],
    ])
      expect(() => parseCatalogBrands(value)).toThrow();
    for (const value of [null, [], {}, { modelos: null }, { modelos: [] }])
      expect(() => parseCatalogModels(value)).toThrow();
    expect(() => parseCatalogCities({})).toThrow();
  });

  it("accepts numeric/string IDs and deduplicates identities without creating entries", () => {
    expect(
      parseCatalogCities([
        { id: 4106902, nome: "Curitiba" },
        { id: "4106902", nome: "Curitiba" },
        { id: 1, nome: "" },
        null,
      ]),
    ).toEqual([{ code: "4106902", name: "Curitiba" }]);
  });
});

describe("search catalog route", () => {
  it("looks up models by brand code with a bounded timeout and daily data cache", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(volkswagen));
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(request("type=models&brand=59"));
    expect(response.status).toBe(200);
    expect(
      (await response.json()).map((row: { name: string }) => row.name),
    ).toEqual(["Golf", "Golf Variant", "New Beetle"]);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://parallelum.com.br/fipe/api/v1/carros/marcas/59/modelos",
      expect.objectContaining({
        next: { revalidate: 86400 },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("loads brands and cities without consulting listings or credentials", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([{ codigo: "25", nome: "Honda" }]))
      .mockResolvedValueOnce(
        Response.json([{ id: 4106902, nome: "Curitiba" }]),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await (await GET(request("type=brands"))).json()).toEqual([
      { code: "25", name: "Honda", searchName: "Honda" },
    ]);
    expect(await (await GET(request("type=cities&state=PR"))).json()).toEqual([
      { code: "4106902", name: "Curitiba" },
    ]);
    expect(fetcher.mock.calls[1][0]).toBe(
      "https://servicodados.ibge.gov.br/api/v1/localidades/estados/PR/municipios?orderBy=nome",
    );
    expect(fetcher.mock.calls[0][1].headers).toEqual({
      Accept: "application/json",
    });
  });

  it.each([
    "type=models&brand=Volkswagen",
    "type=models&brand=../59",
    "type=cities&state=XX",
    "type=cities&state=",
    "type=versions",
  ])("rejects invalid lookup %s before a remote call", async (query) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await GET(request(query))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["timeout", "http", "json", "shape", "empty"])(
    "offers manual entry on %s failure without exposing upstream details",
    async (failure) => {
      const fetcher = vi.fn();
      if (failure === "timeout")
        fetcher.mockRejectedValue(new Error("upstream details"));
      if (failure === "http")
        fetcher.mockResolvedValue(new Response("down", { status: 502 }));
      if (failure === "json")
        fetcher.mockResolvedValue(new Response("not json"));
      if (failure === "shape")
        fetcher.mockResolvedValue(Response.json({ error: "upstream" }));
      if (failure === "empty") fetcher.mockResolvedValue(Response.json([]));
      vi.stubGlobal("fetch", fetcher);
      const response = await GET(request("type=brands"));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "Catálogo temporariamente indisponível; use a entrada manual.",
      });
    },
  );
});
