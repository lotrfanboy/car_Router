import { NextResponse } from "next/server";
import { vehicleRepository } from "@/lib/repository";
import { apiError, checkOrigin } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await vehicleRepository.list());
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    return NextResponse.json(
      await vehicleRepository.create(await request.json()),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
