import { NextResponse } from "next/server";
import { vehicleRepository } from "@/lib/repository";
import { apiError } from "@/lib/http";

export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await vehicleRepository.priceHistory((await params).id),
    );
  } catch (error) {
    return apiError(error);
  }
}
