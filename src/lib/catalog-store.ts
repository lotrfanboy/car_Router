import { readFile } from "node:fs/promises";
import { catalogSchema, type VehicleCatalog } from "./vehicle-catalog";
import bundled from "../data/vehicle-catalog.json";

/** Only local, validated catalog data. This path cannot invoke a paid provider. */
export async function readVehicleCatalog(): Promise<VehicleCatalog> {
  return catalogSchema.parse(
    process.env.VEHICLE_CATALOG_PATH
      ? JSON.parse(await readFile(process.env.VEHICLE_CATALOG_PATH, "utf8"))
      : bundled,
  );
}
