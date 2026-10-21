import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, checkOrigin } from "@/lib/http";
import { SearchError } from "@/lib/discovery-store";
import { saveRadar } from "@/lib/radar";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, ctx: Context) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    return NextResponse.json(
      await saveRadar(await request.json(), (await ctx.params).id),
    );
  } catch (e) {
    return e instanceof SearchError
      ? NextResponse.json({ error: e.message }, { status: e.status })
      : apiError(e);
  }
}
export async function DELETE(request: Request, ctx: Context) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    const { id } = await ctx.params;
    const running = await db.radarRun.findFirst({
      where: {
        radarId: id,
        status: "running",
        startedAt: { gte: new Date(Date.now() - 30 * 60000) },
      },
    });
    if (running)
      return NextResponse.json(
        {
          error:
            "Pause o Radar e aguarde a execução em andamento antes de excluir.",
        },
        { status: 409 },
      );
    await db.radar.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (e) {
    return apiError(e);
  }
}
