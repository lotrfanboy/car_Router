import { describe, expect, it, vi } from "vitest";
import {
  APPROVED_BATCH,
  assertBatchBudget,
  claimNextOperation,
  operationRequest,
  performOperation,
  sanitizeOperationResponse,
  validOlxValidationUrl,
} from "../scripts/provider-operations.mjs";

const catalog = {
  id: "catalog",
  batchId: APPROVED_BATCH,
  kind: "catalog",
  provider: "reef",
  credits: 1,
  status: "queued",
  request: JSON.stringify({ vehicle_type: "car" }),
};
const webmotors = {
  ...catalog,
  id: "webmotors",
  kind: "validation",
  credits: 2,
  request: JSON.stringify({
    make: "CHEVROLET",
    model: "CELTA",
    page: 1,
    page_size: 10,
    location: "pr",
  }),
};
const olxUrl =
  "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/estado-pr?q=CHEVROLET+CELTA&sf=1";
const olx = {
  ...catalog,
  id: "olx",
  provider: "gecko",
  kind: "validation",
  request: JSON.stringify({ target: "olx.com.br", type: "plp", url: olxUrl }),
};

describe("explicit provider operation approval bounds", () => {
  it("accepts only the authorized batch and fixed request shapes", () => {
    expect(operationRequest(catalog).url).toBe(
      "https://api.reefapi.com/webmotors/v1/makes_models",
    );
    expect(operationRequest(webmotors).body).not.toHaveProperty("trim");
    expect(operationRequest(olx).url).toBe(
      "https://api.geckoapi.com.br/v1/extract",
    );
    expect(() => operationRequest({ ...catalog, batchId: "other" })).toThrow();
    expect(() => operationRequest({ ...catalog, credits: 2 })).toThrow();
    expect(() =>
      operationRequest({
        ...catalog,
        request: '{"vehicle_type":"car","url":"https://example.test"}',
      }),
    ).toThrow();
    expect(() =>
      operationRequest({
        ...webmotors,
        request: JSON.stringify({
          make: "CHEVROLET",
          model: "CELTA",
          page: 1,
          page_size: 10,
          trim: "LT",
        }),
      }),
    ).toThrow();
    expect(() =>
      operationRequest({
        ...webmotors,
        request: JSON.stringify({
          make: "CHEVROLET",
          model: "CELTA",
          page: 2,
          page_size: 10,
        }),
      }),
    ).toThrow();
  });
  it("counts queued, running and failed approvals against the entire batch cap", () => {
    const jobs = [
      catalog,
      { ...webmotors, status: "failed" },
      { ...webmotors, id: "web-2", status: "running" },
      olx,
      { ...olx, id: "olx-2", status: "succeeded" },
    ];
    expect(assertBatchBudget(jobs)).toEqual({ reef: 5, gecko: 2 });
    expect(() => assertBatchBudget([...jobs, { ...olx, id: "extra" }])).toThrow(
      "budget_exceeded",
    );
    expect(() => assertBatchBudget([webmotors, webmotors, webmotors])).toThrow(
      "budget_exceeded",
    );
    expect(() => assertBatchBudget([olx, olx, olx])).toThrow("budget_exceeded");
    expect(() =>
      assertBatchBudget([{ ...catalog, provider: "constructor" }]),
    ).toThrow("invalid_approved_batch");
  });
  it.each([
    "https://evil.test/autos-e-pecas/carros-vans-e-utilitarios?q=CELTA",
    "https://www.olx.com.br.evil.test/autos-e-pecas/carros-vans-e-utilitarios?q=CELTA",
    "https://secret@www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?q=CELTA",
    "http://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?q=CELTA",
    "https://www.olx.com.br:444/autos-e-pecas/carros-vans-e-utilitarios?q=CELTA",
    "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/estado-zz?q=CELTA",
    "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?q=CELTA&redirect=https://evil.test",
    "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?q=CELTA&o=2",
    "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?q=CELTA&q=CAMARO",
    "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios-bogus?q=CELTA",
  ])("rejects unapproved OLX URLs: %s", (url) =>
    expect(validOlxValidationUrl(url)).toBe(false),
  );
  it("allows a known regional OLX category without arbitrary outbound hosts", () => {
    expect(validOlxValidationUrl(olxUrl)).toBe(true);
    expect(
      validOlxValidationUrl(
        "https://pr.olx.com.br/regiao-de-curitiba-e-paranagua/autos-e-pecas/carros-vans-e-utilitarios?q=CELTA",
      ),
    ).toBe(true);
  });
});

describe("provider response privacy and execution", () => {
  it("retains unknown catalog structure but strips credentials and contact metadata", () => {
    const response = sanitizeOperationResponse(catalog, {
      ok: true,
      data: {
        makes: [
          { id: 2, name: "CHEVROLET", models: [{ id: 1143, name: "CELTA" }] },
        ],
      },
      headers: { Authorization: "secret" },
      api_key: "secret",
      contact: { email: "private" },
    });
    expect(response).toEqual({
      ok: true,
      data: {
        makes: [
          { id: 2, name: "CHEVROLET", models: [{ id: 1143, name: "CELTA" }] },
        ],
      },
    });
  });
  it("persists only public vehicle identity fields from validation responses", () => {
    const response = sanitizeOperationResponse(webmotors, {
      data: {
        listings: [
          {
            listing_id: 1,
            make: "CHEVROLET",
            model: "CELTA",
            trim: "LT",
            make_id: 2,
            model_id: 1143,
            trim_id: 3,
            url: "https://www.webmotors.com.br/comprar/chevrolet/celta/test/1?token=private",
            title: "Phone private",
            seller: { phone: "private" },
            email: "private",
            description: "private",
            location: { address: "private" },
          },
        ],
      },
    });
    expect(response.records[0]).toEqual({
      id: 1,
      brand: "CHEVROLET",
      model: "CELTA",
      version: "LT",
      brandId: 2,
      modelId: 1143,
      versionId: 3,
      url: "https://www.webmotors.com.br/comprar/chevrolet/celta/test/1",
    });
    expect(JSON.stringify(response)).not.toContain("private");
    const gecko = sanitizeOperationResponse(olx, {
      data: {
        items: [
          {
            id: 7,
            url: "https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/celta-7",
            properties: [
              { name: "vehicle_brand", value: "Chevrolet" },
              { name: "vehicle_model", value: "Celta Life 1.0" },
              { name: "phone", value: "private" },
            ],
          },
        ],
      },
    });
    expect(gecko.records[0].model).toBe("Celta Life 1.0");
    expect(JSON.stringify(gecko)).not.toContain("private");
  });
  it("uses a single intercepted POST with redirect rejection and the existing credential", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ ok: true, data: { makes: [] } }),
    );
    await performOperation(catalog, "test-key", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.reefapi.com/webmotors/v1/makes_models",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-key",
        },
        body: '{"vehicle_type":"car"}',
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it("does not retry failures or include upstream error details", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("private credential echoed");
    });
    await expect(
      performOperation(catalog, "test-key", fetcher),
    ).rejects.toThrow("provider_request_failed");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const denied = vi.fn(async () => new Response("private", { status: 402 }));
    await expect(performOperation(catalog, "test-key", denied)).rejects.toThrow(
      "provider_http_402",
    );
    expect(denied).toHaveBeenCalledTimes(1);
  });
});

describe("atomic queue claiming", () => {
  const database = (rows: object[]) => ({
    query: vi.fn(async (sql: string) =>
      sql.startsWith("SELECT *")
        ? { rows }
        : sql.includes("RETURNING id")
          ? { rowCount: 1, rows: [{ id: "catalog" }] }
          : { rows: [], rowCount: 1 },
    ),
  });
  it("locks the batch, marks the job running and reserves credits before committing", async () => {
    const client = database([catalog]);
    expect(
      (await claimNextOperation(client, { REEF_API_KEY: "test-key" }))!
        .operation,
    ).toEqual(catalog);
    const statements = client.query.mock.calls.map(([sql]) => sql);
    expect(statements[0]).toBe("BEGIN");
    expect(statements[1]).toContain("pg_advisory_xact_lock");
    expect(statements[2]).toContain("FOR UPDATE");
    expect(statements[3]).toContain("status='running'");
    expect(statements[4]).toContain('INSERT INTO "ProviderSpend"');
    expect(statements[5]).toBe("COMMIT");
  });
  it("never retries running or failed work and makes no reservation for an empty queue", async () => {
    const client = database([
      { ...catalog, status: "running" },
      { ...webmotors, status: "failed" },
    ]);
    expect(
      await claimNextOperation(client, { REEF_API_KEY: "test-key" }),
    ).toBeNull();
    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO "ProviderSpend"'),
      ),
    ).toBe(false);
  });
  it("rejects over-budget queues before any mutation or credit reservation", async () => {
    const client = database([webmotors, webmotors, webmotors]);
    await expect(
      claimNextOperation(client, { REEF_API_KEY: "test-key" }),
    ).rejects.toThrow("budget_exceeded");
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(
      client.query.mock.calls.some(
        ([sql]) => sql.startsWith("UPDATE") || sql.startsWith("INSERT"),
      ),
    ).toBe(false);
  });
  it("marks malformed requests failed without spending credits", async () => {
    const client = database([{ ...catalog, request: "invalid JSON" }]);
    expect(
      await claimNextOperation(client, { REEF_API_KEY: "test-key" }),
    ).toEqual({ skipped: true, id: "catalog" });
    expect(
      client.query.mock.calls.some(([sql]) => sql.includes("status='failed'")),
    ).toBe(true);
    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO "ProviderSpend"'),
      ),
    ).toBe(false);
  });
});
