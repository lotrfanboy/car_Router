import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizedTick } from "@/lib/radar";
import {
  previewRadarTestEmail,
  confirmRadarTestEmail,
} from "@/lib/radar-email";
import { apiError } from "@/lib/http";
export const runtime = "nodejs";
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview") }),
  z.object({
    action: z.literal("send"),
    previewId: z.string().min(1),
    confirmed: z.literal(true),
  }),
]);
export async function POST(request: Request) {
  if (!authorizedTick(request))
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const value = input.parse(await request.json());
    return NextResponse.json(
      value.action === "preview"
        ? await previewRadarTestEmail()
        : await confirmRadarTestEmail(value.previewId),
    );
  } catch (error) {
    return apiError(error);
  }
}
