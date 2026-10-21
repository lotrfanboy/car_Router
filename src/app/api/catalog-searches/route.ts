import { NextResponse } from "next/server";
import { apiError, checkOrigin } from "@/lib/http";
import {
  catalogSearchBody,
  CatalogSearchError,
  catalogSearchRepository,
} from "@/lib/catalog-searches";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await catalogSearchRepository.list());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    return NextResponse.json(
      await catalogSearchRepository.create(await catalogSearchBody(request)),
      { status: 201 },
    );
  } catch (error) {
    return error instanceof CatalogSearchError
      ? NextResponse.json({ error: error.message }, { status: error.status })
      : apiError(error);
  }
}
