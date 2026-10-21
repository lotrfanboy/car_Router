import { NextResponse } from "next/server";
import { apiError, checkOrigin } from "@/lib/http";
import {
  integrationStatus,
  listSearches,
  saveSearch,
  SearchError,
} from "@/lib/discovery-store";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  try {
    return NextResponse.json({
      searches: await listSearches(),
      integrations: await integrationStatus(),
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    const row = await saveSearch(await request.json());
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (e) {
    return e instanceof SearchError
      ? NextResponse.json({ error: e.message }, { status: e.status })
      : apiError(e);
  }
}
