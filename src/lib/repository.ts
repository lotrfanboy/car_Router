import { db } from "./db";
import { vehicleSchema } from "./vehicle";
export const vehicleRepository = {
  list: () => db.vehicle.findMany({ orderBy: { createdAt: "desc" } }),
  find: (id: string) => db.vehicle.findUnique({ where: { id } }),
  create: (input: unknown) =>
    db.vehicle.create({ data: vehicleSchema.parse(input) }),
  update: (id: string, input: unknown) =>
    db.vehicle.update({ where: { id }, data: vehicleSchema.parse(input) }),
  favorite: (id: string, favorite: boolean) =>
    db.vehicle.update({ where: { id }, data: { favorite } }),
  delete: (id: string) => db.vehicle.delete({ where: { id } }),
};
