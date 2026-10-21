import { NextResponse } from "next/server";
import { apiError, checkOrigin } from "@/lib/http";
import { SearchError } from "@/lib/discovery-store";
import { listRadars, saveRadar } from "@/lib/radar";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await listRadars());
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    return NextResponse.json(await saveRadar(await request.json()), {
      status: 201,
    });
  } catch (e) {
    return e instanceof SearchError
      ? NextResponse.json({ error: e.message }, { status: e.status })
      : apiError(e);
  }
}
