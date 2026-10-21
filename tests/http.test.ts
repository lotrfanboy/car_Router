import { describe, it, expect } from "vitest";
import { checkOrigin } from "../src/lib/http";
describe("same-origin guard", () => {
  it("accepts the browser Host even when Next normalizes its internal URL", () => {
    const request = new Request("http://localhost:3100/api/vehicles", {
      headers: {
        host: "127.0.0.1:3100",
        origin: "http://127.0.0.1:3100",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(checkOrigin(request)).toBeUndefined();
  });
  it("rejects mismatched hosts, ports, opaque origins and cross-site fetches", () => {
    const cases: Record<string, string>[] = [
      { host: "127.0.0.1:3100", origin: "https://other.example" },
      { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3000" },
      { host: "127.0.0.1:3100", origin: "null" },
      {
        host: "127.0.0.1:3100",
        origin: "http://127.0.0.1:3100",
        "sec-fetch-site": "cross-site",
      },
    ];
    for (const headers of cases)
      expect(
        checkOrigin(
          new Request("http://localhost:3100/api/vehicles", { headers }),
        )?.status,
      ).toBe(403);
  });
});
