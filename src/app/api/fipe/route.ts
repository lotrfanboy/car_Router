import { NextRequest, NextResponse } from "next/server";
import { readLocalFipe, localFipeSelection } from "@/lib/fipe-local";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams,
    type = p.get("type") ?? "";
  if (!["brands", "models", "years", "detail"].includes(type))
    return NextResponse.json(
      { error: "Seleção FIPE inválida." },
      { status: 400 },
    );
  try {
    const local = await readLocalFipe();
    if (!local)
      return NextResponse.json(
        {
          error:
            "Nenhuma base FIPE mensal foi importada neste ambiente. A atualização depende de uma tabela com origem e direitos de uso confirmados. Nenhuma API é consultada ao abrir esta tela.",
        },
        { status: 503 },
      );
    const selection = localFipeSelection(local.data, {
      type,
      brand: p.get("brand") ?? undefined,
      model: p.get("model") ?? undefined,
      year: p.get("year") ?? undefined,
    });
    if (!selection)
      return NextResponse.json(
        { error: "Referência não encontrada na base local selecionada." },
        { status: 404 },
      );
    return NextResponse.json({
      provider: local.data.source,
      recordCount: local.data.records.length,
      sourceUrl: local.data.sourceUrl,
      competence: local.data.competence,
      referenceMonth: local.data.referenceMonth,
      importedAt: local.data.importedAt,
      stale: local.stale,
      readAt: new Date().toISOString(),
      ...selection,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Não foi possível ler a base FIPE local. Confira a importação; nenhum valor foi estimado ou buscado em uma API.",
      },
      { status: 503 },
    );
  }
}
