import { NextRequest, NextResponse } from "next/server";
import { states } from "@/lib/vehicle";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter((item): item is Row => Boolean(item && typeof item === "object"))
    : [];

async function json(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Catálogo indisponível (${response.status})`);
  return response.json() as Promise<unknown>;
}

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type");
    if (type === "brands") {
      const data = await json("https://parallelum.com.br/fipe/api/v1/carros/marcas");
      return NextResponse.json(
        rows(data).flatMap((row) =>
          typeof row.codigo === "string" && typeof row.nome === "string"
            ? [{ code: row.codigo, name: row.nome }]
            : [],
        ),
      );
    }
    if (type === "models") {
      const brand = request.nextUrl.searchParams.get("brand") ?? "";
      if (!/^\d{1,4}$/.test(brand))
        return NextResponse.json({ error: "Marca inválida." }, { status: 400 });
      const data = (await json(
        `https://parallelum.com.br/fipe/api/v1/carros/marcas/${brand}/modelos`,
      )) as Row;
      return NextResponse.json(
        rows(data.modelos).flatMap((row) =>
          typeof row.codigo === "number" && typeof row.nome === "string"
            ? [{ code: String(row.codigo), name: row.nome }]
            : [],
        ),
      );
    }
    if (type === "cities") {
      const state = request.nextUrl.searchParams.get("state") ?? "";
      if (!states.includes(state))
        return NextResponse.json({ error: "UF inválida." }, { status: 400 });
      const data = await json(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${state}/municipios?orderBy=nome`,
      );
      return NextResponse.json(
        rows(data).flatMap((row) =>
          typeof row.id === "number" && typeof row.nome === "string"
            ? [{ code: String(row.id), name: row.nome }]
            : [],
        ),
      );
    }
    return NextResponse.json({ error: "Catálogo inválido." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Catálogo temporariamente indisponível; use a entrada manual." },
      { status: 503 },
    );
  }
}
