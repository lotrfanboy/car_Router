import { NextResponse } from "next/server";
import { workspaceOverview } from "@/lib/workspace-overview";
import { apiError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await workspaceOverview());
  } catch (error) {
    return apiError(error);
  }
}
