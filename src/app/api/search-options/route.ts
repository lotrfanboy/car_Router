import { NextRequest, NextResponse } from "next/server";
import { states } from "@/lib/vehicle";
import { catalogOption, parseCatalogCities } from "@/lib/vehicle-catalog";
import { readVehicleCatalog } from "@/lib/catalog-store";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const type = params.get("type");
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
    if (!["brands", "models", "versions"].includes(type ?? ""))
      return NextResponse.json(
        { error: "Catálogo inválido." },
        { status: 400 },
      );
    const catalog = await readVehicleCatalog();
    if (!catalog.brands.length)
      return NextResponse.json(
        {
          error:
            "Catálogo de veículos ainda não importado. Use a entrada manual; nenhuma coleta foi executada.",
        },
        { status: 503 },
      );
    const brand = params.get("brand");
    const model = params.get("model");
    if (type !== "brands" && !catalog.brands.some((item) => item.id === brand))
      return NextResponse.json({ error: "Marca inválida." }, { status: 400 });
    if (
      type === "versions" &&
      !catalog.models.some(
        (item) => item.id === model && item.brandId === brand,
      )
    )
      return NextResponse.json(
        { error: "Modelo não pertence à marca." },
        { status: 400 },
      );
    const rows =
      type === "brands"
        ? catalog.brands
        : type === "models"
          ? catalog.models.filter((item) => item.brandId === brand)
          : catalog.versions.filter((item) => item.modelId === model);
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
