import { NextResponse } from "next/server";
import { apiError, checkOrigin } from "@/lib/http";
import {
  CatalogSearchError,
  catalogSearchRepository,
} from "@/lib/catalog-searches";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    return NextResponse.json(
      await catalogSearchRepository.remove((await params).id),
    );
  } catch (error) {
    return error instanceof CatalogSearchError
      ? NextResponse.json({ error: error.message }, { status: error.status })
      : apiError(error);
  }
}
