import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ source: string; id: string }> },
) {
  const { source, id } = await ctx.params;
  if (!["olx", "webmotors"].includes(source))
    return NextResponse.json({ error: "Fonte inválida." }, { status: 400 });
  const listing = await db.discoveredListing.findUnique({
    where: { source_externalId: { source, externalId: id } },
    select: { prices: { orderBy: { id: "asc" } } },
  });
  return listing
    ? NextResponse.json(listing.prices)
    : NextResponse.json(
        { error: "Anúncio ainda não observado." },
        { status: 404 },
      );
}
