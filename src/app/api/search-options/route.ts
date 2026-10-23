import { NextRequest, NextResponse } from "next/server";
import { states } from "@/lib/vehicle";
import { catalogOption, parseCatalogCities } from "@/lib/vehicle-catalog";
import { readVehicleCatalog } from "@/lib/catalog-store";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const type = params.get("type");
    if (type === "versions" || type === "configurations")
      return NextResponse.json(
        { error: "Versões são filtradas nos resultados da busca." },
        { status: 400 },
      );
    if (type === "cities") {
      const state = params.get("state") ?? "";
      if (!states.includes(state))
        return NextResponse.json({ error: "UF inválida." }, { status: 400 });
      const response = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${state}/municipios?orderBy=nome`,
        {
          headers: { Accept: "application/json" },
          next: { revalidate: 86400 },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw new Error("Catálogo de cidades indisponível.");
      return NextResponse.json(parseCatalogCities(await response.json()));
    }
    if (!["brands", "models"].includes(type ?? ""))
      return NextResponse.json(
        { error: "Catálogo inválido." },
        { status: 400 },
      );
    const catalog = await readVehicleCatalog();
    const searchableBrandIds = new Set(
      (catalog.queryTargets ?? []).map((target) => target.canonicalBrandId),
    );
    const searchableModelIds = new Set(
      (catalog.queryTargets ?? []).map((target) => target.canonicalModelId),
    );
    if (!searchableBrandIds.size)
      return NextResponse.json(
        {
          error:
            "Catálogo de veículos ainda não importado. Use a entrada manual; nenhuma coleta foi executada.",
        },
        { status: 503 },
      );
    const brand = params.get("brand");
    if (type !== "brands" && (!brand || !searchableBrandIds.has(brand)))
      return NextResponse.json({ error: "Marca inválida." }, { status: 400 });
    const rows =
      type === "brands"
        ? catalog.brands.filter((item) => searchableBrandIds.has(item.id))
        : catalog.models.filter(
            (item) => item.brandId === brand && searchableModelIds.has(item.id),
          );
    return NextResponse.json(
      rows
        .map((item) => catalogOption(item, catalog.revision))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Catálogo indisponível. Nenhuma coleta de anúncios foi executada.",
      },
      { status: 503 },
    );
  }
}
