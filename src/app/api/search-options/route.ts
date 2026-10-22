import { NextRequest, NextResponse } from "next/server";
import { states } from "@/lib/vehicle";
import {
  parseCatalogBrands,
  parseCatalogCities,
  parseCatalogModels,
  parseCatalogYears,
} from "@/lib/vehicle-catalog";

async function json(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(`Catálogo indisponível (${response.status})`);
  return response.json() as Promise<unknown>;
}

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type");
    if (type === "brands") {
      const data = await json(
        "https://parallelum.com.br/fipe/api/v1/carros/marcas",
      );
      return NextResponse.json(parseCatalogBrands(data));
    }
    if (type === "models") {
      const brand = request.nextUrl.searchParams.get("brand") ?? "";
      if (!/^\d{1,4}$/.test(brand))
        return NextResponse.json({ error: "Marca inválida." }, { status: 400 });
      const data = await json(
        `https://parallelum.com.br/fipe/api/v1/carros/marcas/${brand}/modelos`,
      );
      return NextResponse.json(parseCatalogModels(data));
    }
    if (type === "years") {
      const brand = request.nextUrl.searchParams.get("brand") ?? "";
      const encoded = request.nextUrl.searchParams.get("models") ?? "";
      const models = encoded.split(",").filter(Boolean);
      if (
        !/^\d{1,4}$/.test(brand) ||
        !models.length ||
        models.length > 40 ||
        models.some((code) => !/^\d{1,10}$/.test(code))
      )
        return NextResponse.json(
          { error: "Modelo inválido." },
          { status: 400 },
        );
      const catalog = await json(
        `https://parallelum.com.br/fipe/api/v1/carros/marcas/${brand}/modelos`,
      );
      const allowed = parseCatalogModels(catalog)
        .flatMap((family) => family.versions)
        .filter((model) => models.includes(model.code));
      if (allowed.length !== new Set(models).size)
        return NextResponse.json(
          { error: "Modelo inválido." },
          { status: 400 },
        );
      const values = await Promise.all(
        allowed.map(async (model) => ({
          model,
          value: await json(
            `https://parallelum.com.br/fipe/api/v1/carros/marcas/${brand}/modelos/${model.code}/anos`,
          ),
        })),
      );
      return NextResponse.json(parseCatalogYears(values));
    }
    if (type === "cities") {
      const state = request.nextUrl.searchParams.get("state") ?? "";
      if (!states.includes(state))
        return NextResponse.json({ error: "UF inválida." }, { status: 400 });
      const data = await json(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${state}/municipios?orderBy=nome`,
      );
      return NextResponse.json(parseCatalogCities(data));
    }
    return NextResponse.json({ error: "Catálogo inválido." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Catálogo temporariamente indisponível; use a entrada manual." },
      { status: 503 },
    );
  }
}
