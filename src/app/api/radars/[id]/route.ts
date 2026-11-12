import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, checkOrigin } from "@/lib/http";
import { SearchError } from "@/lib/discovery-store";
import { saveRadar } from "@/lib/radar";
import {
  saveRadarPreferences,
  pauseRadar,
  resumeRadar,
} from "@/lib/radar-preferences";
import { getRadarDetail } from "@/lib/radar-detail";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, ctx: Context) {
  try {
    const detail = await getRadarDetail((await ctx.params).id);
    return detail
      ? NextResponse.json(detail)
      : NextResponse.json({ error: "Radar não encontrado." }, { status: 404 });
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(request: Request, ctx: Context) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    const input = await request.json();
    const { id } = await ctx.params;
    return NextResponse.json(
      await (input?.action === "pause"
        ? pauseRadar(id)
        : input?.action === "resume"
          ? resumeRadar(id)
          : input?.experience === "managed"
            ? saveRadarPreferences(input, id)
            : saveRadar(input, id)),
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
