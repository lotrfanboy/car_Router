import { expect, it } from "vitest";
import { normalizeOlx } from "../src/lib/discovery-providers";

const base = {
  id: "123",
  url: "https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/carro-123",
  title: "Carro anunciado",
};

it("keeps the actual OLX image supplied with the listing", () => {
  const [listing] = normalizeOlx(
    { items: [{ ...base, images: [{ url: "https://img.olx.com.br/car-123.jpg" }] }] },
    "2026-10-22T00:00:00.000Z",
  );
  expect(listing.imageUrl).toBe("https://img.olx.com.br/car-123.jpg");
});

it("rejects invalid or unrelated image values", () => {
  const [listing] = normalizeOlx(
    { items: [{ ...base, images: [{ url: "javascript:alert(1)" }] }] },
    "2026-10-22T00:00:00.000Z",
  );
  expect(listing.imageUrl).toBeNull();
});
