import { NextResponse } from "next/server";
import { savedListings } from "@/lib/listings-store";
import { apiError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await savedListings());
  } catch (e) {
    return apiError(e);
  }
}
