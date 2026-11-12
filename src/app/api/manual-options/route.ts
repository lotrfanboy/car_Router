import { NextRequest, NextResponse } from "next/server";
import { readVehicleCatalog } from "@/lib/catalog-store";
import { resolveCatalogVehicle } from "@/lib/vehicle-catalog";
import { db } from "@/lib/db";
import type { Listing } from "@/lib/discovery";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams,
      type = p.get("type"),
      catalog = await readVehicleCatalog();
    const brand = catalog.brands.find((b) => b.id === p.get("brand")),
      model = catalog.models.find(
        (m) => m.id === p.get("model") && m.brandId === brand?.id,
      );
    const option = (r: { id: string; name: string }) => ({
      code: r.id,
      name: r.name,
    });
    if (type === "brands")
      return NextResponse.json({
        options: catalog.brands.map(option),
        origin: "Catálogo local de veículos",
      });
    if (!brand)
      return NextResponse.json(
        { error: "Selecione a marca." },
        { status: 400 },
      );
    if (type === "models")
      return NextResponse.json({
        options: catalog.models
          .filter((m) => m.brandId === brand.id)
          .map(option),
        origin: "Catálogo local de veículos",
      });
    if (type !== "versions" || !model)
      return NextResponse.json(
        { error: "Selecione o modelo." },
        { status: 400 },
      );
    const versions = new Map(
      catalog.versions
        .filter((v) => v.modelId === model.id)
        .map((v) => [
          v.name.normalize("NFC").toLocaleLowerCase("pt-BR"),
          option(v),
        ]),
    );
    const rows = await db.discoveredListing.findMany({
      orderBy: { lastSeen: "desc" },
      take: 5000,
      select: { payload: true },
    });
    for (const row of rows) {
      try {
        const l = JSON.parse(row.payload) as Listing;
        if (
          !["olx", "webmotors"].includes(l.source) ||
          typeof l.version !== "string" ||
          !l.version.trim() ||
          l.versionOrigin !== "explicit"
        )
          continue;
        const resolved = resolveCatalogVehicle(catalog, {
          source: l.source,
          brand: l.original?.brand ?? l.brand,
          model: l.sourceModel ?? l.original?.model ?? l.model,
          version: l.original?.version ?? l.version,
          brandId: l.sourceIdentity?.brandId,
          modelId: l.sourceIdentity?.modelId,
          versionId: l.sourceIdentity?.versionId,
        });
        if (
          resolved.identity?.brandId === brand.id &&
          resolved.identity?.modelId === model.id &&
          resolved.classification.model === "confirmed"
        ) {
          const name = l.version.trim(),
            key = name.normalize("NFC").toLocaleLowerCase("pt-BR");
          if (!versions.has(key))
            versions.set(key, { code: `observed:${versions.size}`, name });
        }
      } catch {
        /* Malformed or unresolved evidence is not a selectable version. */
      }
    }
    return NextResponse.json({
      options: [...versions.values()].sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR"),
      ),
      origin:
        "Versões do catálogo e descrições explícitas de anúncios já observados",
      limited: true,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Não foi possível carregar o catálogo. Você pode manter a entrada manual.",
      },
      { status: 503 },
    );
  }
}
