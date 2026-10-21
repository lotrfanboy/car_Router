import { NextResponse } from "next/server";
import { apiError, checkOrigin } from "@/lib/http";
import { executeSearch, SearchError } from "@/lib/discovery-store";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    return NextResponse.json(await executeSearch((await ctx.params).id));
  } catch (e) {
    return e instanceof SearchError
      ? NextResponse.json({ error: e.message }, { status: e.status })
      : apiError(e);
  }
}
