import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getListing } from "@/lib/listings-store";
import { apiError, checkOrigin } from "@/lib/http";
type Context = { params: Promise<{ source: string; id: string }> };
export const dynamic = "force-dynamic";
export async function GET(_: Request, ctx: Context) {
  try {
    const { source, id } = await ctx.params;
    const row = await getListing(source, id);
    return row
      ? NextResponse.json(row)
      : NextResponse.json(
          { error: "Anúncio não encontrado." },
          { status: 404 },
        );
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request, ctx: Context) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    const { source, id } = await ctx.params;
    const { saved } = z
      .object({ saved: z.boolean() })
      .parse(await request.json());
    await db.discoveredListing.update({
      where: { source_externalId: { source, externalId: id } },
      data: { savedAt: saved ? new Date() : null },
    });
    return NextResponse.json({ saved });
  } catch (e) {
    return apiError(e);
  }
}
