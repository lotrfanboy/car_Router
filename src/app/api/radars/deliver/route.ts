import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizedTick } from "@/lib/radar";
import {
  deliverPendingRadarEmails,
  reconcileRadarEmails,
} from "@/lib/radar-email";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!authorizedTick(request))
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { deliveryId } = z
      .object({ deliveryId: z.string().min(1) })
      .parse(await request.json());
    const row = await db.radarEmailDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!row || row.kind !== "digest")
      return NextResponse.json(
        { error: "Entrega não encontrada." },
        { status: 404 },
      );
    // Explicit operator retry may deliver an already collected run after its run limit paused it.
    await deliverPendingRadarEmails(deliveryId);
    await reconcileRadarEmails();
    const result = await db.radarEmailDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    return NextResponse.json({
      id: result.id,
      status: result.status,
      attempts: result.attempts,
      providerId: result.providerId,
      lastError: result.lastError,
    });
  } catch (error) {
    return apiError(error);
  }
}
