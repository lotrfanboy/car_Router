import { NextResponse } from "next/server";
import { z } from "zod";
import { vehicleRepository } from "@/lib/repository";
import { apiError, checkOrigin } from "@/lib/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    const vehicle = await vehicleRepository.find((await params).id);
    return vehicle
      ? NextResponse.json(vehicle)
      : NextResponse.json(
          { error: "Anúncio não encontrado." },
          { status: 404 },
        );
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request, { params }: Context) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    return NextResponse.json(
      await vehicleRepository.update((await params).id, await request.json()),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    const { favorite } = z
      .object({ favorite: z.boolean() })
      .strict()
      .parse(await request.json());
    return NextResponse.json(
      await vehicleRepository.favorite((await params).id, favorite),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request, { params }: Context) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  try {
    await vehicleRepository.delete((await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
