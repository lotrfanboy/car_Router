import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
export const maxManualImageBytes = 8 * 1024 * 1024;
export const manualImageId =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:jpg|png|webp)$/;
export function rasterType(bytes: Uint8Array): "jpg" | "png" | "webp" | null {
  if (bytes.length < 12) return null;
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  const text = (a: number, b: number) =>
    String.fromCharCode(...bytes.slice(a, b));
  return text(0, 4) === "RIFF" && text(8, 12) === "WEBP" ? "webp" : null;
}
export function manualImageDirectory() {
  if (!process.env.DATABASE_URL?.startsWith("file:"))
    throw new Error("Upload de arquivo disponível apenas no ambiente local.");
  return path.join(process.cwd(), "validation-private", "manual-images");
}
export async function storeManualImage(
  bytes: Uint8Array,
  declaredType: string,
) {
  const type = rasterType(bytes),
    expected = type === "jpg" ? "image/jpeg" : `image/${type}`;
  if (
    !type ||
    declaredType !== expected ||
    !bytes.length ||
    bytes.length > maxManualImageBytes
  )
    throw new Error("Use uma imagem JPEG, PNG ou WebP de até 8 MB.");
  const folder = manualImageDirectory(),
    id = `${randomUUID()}.${type}`;
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, id), bytes, { flag: "wx" });
  return { url: `/api/vehicle-images/${id}` };
}
export async function readManualImage(id: string) {
  if (!manualImageId.test(id)) return null;
  try {
    const bytes = await readFile(path.join(manualImageDirectory(), id));
    const type = rasterType(bytes);
    return type
      ? { bytes, contentType: type === "jpg" ? "image/jpeg" : `image/${type}` }
      : null;
  } catch {
    return null;
  }
}
