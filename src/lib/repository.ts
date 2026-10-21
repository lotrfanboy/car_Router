import { db } from "./db";
import { vehicleSchema } from "./vehicle";
export const vehicleRepository = {
  list: () => db.vehicle.findMany({ orderBy: { createdAt: "desc" } }),
  find: (id: string) => db.vehicle.findUnique({ where: { id } }),
  create: (input: unknown) => {
    const data = vehicleSchema.parse(input);
    return db.vehicle.create({
      data: {
        ...data,
        priceHistory: {
          create: { priceCents: data.priceCents, reason: "created" },
        },
      },
    });
  },
  update: (id: string, input: unknown) => {
    const data = vehicleSchema.parse(input);
    return db.$transaction(async (tx) => {
      const previous = await tx.vehicle.findUniqueOrThrow({ where: { id } });
      return tx.vehicle.update({
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
      });
    });
  },
  priceHistory: async (id: string) => {
    await db.vehicle.findUniqueOrThrow({ where: { id }, select: { id: true } });
    return db.vehiclePrice.findMany({
      where: { vehicleId: id },
      orderBy: { id: "asc" },
    });
  },
  favorite: (id: string, favorite: boolean) =>
    db.vehicle.update({ where: { id }, data: { favorite } }),
  delete: (id: string) => db.vehicle.delete({ where: { id } }),
};
