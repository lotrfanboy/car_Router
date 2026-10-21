import { NextResponse } from "next/server";
import { authorizedTick, tickRadars } from "@/lib/radar";
import { SearchError } from "@/lib/discovery-store";
import { apiError } from "@/lib/http";
export const runtime = "nodejs";
export const maxDuration = 900;
export async function POST(request: Request) {
  if (!authorizedTick(request))
    return NextResponse.json(
      { error: "Agendador não autorizado." },
      { status: 401 },
    );
  try {
    return NextResponse.json(await tickRadars());
  } catch (e) {
    return e instanceof SearchError
      ? NextResponse.json({ error: e.message }, { status: e.status })
      : apiError(e);
  }
}
