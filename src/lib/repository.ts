import type { Prisma } from "@/generated/prisma-postgres";
import { db } from "./db";
import { vehicleSchema } from "./vehicle";

// A bounded relation query supplies price changes to the catalog without N+1 requests.
const recentHistory = {
  priceHistory: { orderBy: { id: "desc" }, take: 2 },
} satisfies Prisma.VehicleInclude;
type RecordedVehicle = Prisma.VehicleGetPayload<{
  include: typeof recentHistory;
}>;
function withPriceContext(vehicle: RecordedVehicle) {
  const priceHistory = [...vehicle.priceHistory].reverse();
  return {
    ...vehicle,
    priceHistory,
    // updatedAt also changes when favoriting; only history records a price observation.
    priceRecordedAt: priceHistory.at(-1)?.observedAt ?? null,
  };
}

export const vehicleRepository = {
  list: async () =>
    (
      await db.vehicle.findMany({
        orderBy: { createdAt: "desc" },
        include: recentHistory,
      })
    ).map(withPriceContext),
  find: async (id: string) => {
    const vehicle = await db.vehicle.findUnique({
      where: { id },
      include: recentHistory,
    });
    return vehicle ? withPriceContext(vehicle) : null;
  },
  create: async (input: unknown) => {
    const data = vehicleSchema.parse(input);
    return withPriceContext(
      await db.vehicle.create({
        data: {
          ...data,
          priceHistory: {
            create: { priceCents: data.priceCents, reason: "created" },
          },
        },
        include: recentHistory,
      }),
    );
  },
  update: (id: string, input: unknown) => {
    const data = vehicleSchema.parse(input);
    return db.$transaction(async (tx) => {
      const previous = await tx.vehicle.findUniqueOrThrow({ where: { id } });
      return withPriceContext(
        await tx.vehicle.update({
          where: { id },
          data: {
            ...data,
            ...(previous.priceCents !== data.priceCents
              ? {
                  priceHistory: {
                    create: { priceCents: data.priceCents, reason: "edited" },
                  },
                }
              : {}),
          },
          include: recentHistory,
        }),
      );
    });
  },
  priceHistory: async (id: string) => {
    await db.vehicle.findUniqueOrThrow({ where: { id }, select: { id: true } });
    return db.vehiclePrice.findMany({
      where: { vehicleId: id },
      orderBy: { id: "asc" },
    });
  },
  favorite: async (id: string, favorite: boolean) =>
    withPriceContext(
      await db.vehicle.update({
        where: { id },
        data: { favorite },
        include: recentHistory,
      }),
    ),
  delete: (id: string) => db.vehicle.delete({ where: { id } }),
};
