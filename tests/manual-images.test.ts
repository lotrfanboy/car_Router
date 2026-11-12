import { describe, it, expect } from "vitest";
import { rasterType, manualImageId } from "../src/lib/manual-images";
describe("bounded raster upload identity", () => {
  it("recognizes allowed raster signatures", () => {
    expect(
      rasterType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])),
    ).toBe("png");
    expect(
      rasterType(new Uint8Array([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
    ).toBe("jpg");
    expect(rasterType(new TextEncoder().encode("RIFF0000WEBP1234"))).toBe(
      "webp",
    );
  });
  it("rejects active content, truncation and path traversal", () => {
    expect(
      rasterType(new TextEncoder().encode('<svg onload="alert(1)"></svg>')),
    ).toBeNull();
    expect(rasterType(new Uint8Array([255, 216]))).toBeNull();
    for (const id of ["../../.env", "123.jpg", "file.svg", "%2e%2e%2fsecret"])
      expect(manualImageId.test(id)).toBe(false);
    expect(manualImageId.test("12345678-1234-1234-1234-123456789abc.png")).toBe(
      true,
    );
  });
});
