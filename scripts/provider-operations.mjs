export const APPROVED_BATCH = "search-catalog-20261023";
export const APPROVED_CAPS = Object.freeze({ reef: 5, gecko: 2 });
export const MAX_OPERATIONS = 5;

export class OperationError extends Error {
  constructor(code) {
    super(code);
    this.name = "OperationError";
    this.code = code;
  }
}

/** @returns {never} */
const reject = (code = "invalid_approved_operation") => {
  throw new OperationError(code);
};
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value, max = 160) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[\r\n\u0000]/.test(value);
const onlyKeys = (value, keys) =>
  Object.keys(value).every((key) => keys.includes(key));
const states =
  "ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to".split(
    " ",
  );

export function validOlxValidationUrl(value) {
  try {
    if (!text(value, 1500)) return false;
    const url = new URL(value);
    const host =
      url.hostname === "www.olx.com.br" ||
      states.some((state) => url.hostname === `${state}.olx.com.br`);
    if (
      !host ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return false;
    if (
      !/^\/[a-z0-9/-]+$/.test(url.pathname) ||
      !url.pathname.includes("/autos-e-pecas/carros-vans-e-utilitarios")
    )
      return false;
    const categoryEnd = url.pathname.split(
      "/autos-e-pecas/carros-vans-e-utilitarios",
    );
    if (categoryEnd.length !== 2) return false;
    if (url.hostname === "www.olx.com.br") {
      if (categoryEnd[0] !== "") return false;
      if (categoryEnd[1] && categoryEnd[1] !== "/") {
        const suffix = categoryEnd[1].match(
          /^\/estado-([a-z]{2})(?:\/[a-z0-9-]+){0,2}\/?$/,
        );
        if (!suffix || !states.includes(suffix[1])) return false;
      }
    } else if (
      !/^(?:\/[a-z0-9-]+){0,2}$/.test(categoryEnd[0]) ||
      !["", "/"].includes(categoryEnd[1])
    )
      return false;
    if (
      [...url.searchParams.keys()].some(
        (key) => !["q", "sf", "o", "pe"].includes(key),
      )
    )
      return false;
    if (
      [...url.searchParams.keys()].some(
        (key) => url.searchParams.getAll(key).length !== 1,
      )
    )
      return false;
    if (!text(url.searchParams.get("q"), 160)) return false;
    if (url.searchParams.has("sf") && url.searchParams.get("sf") !== "1")
      return false;
    if (url.searchParams.has("o") && url.searchParams.get("o") !== "1")
      return false;
    if (
      url.searchParams.has("pe") &&
      !/^\d{1,10}$/.test(url.searchParams.get("pe"))
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

/** Fixed endpoints and bounded request shapes; queued JSON cannot choose a host. */
export function operationRequest(operation) {
  if (operation.batchId !== APPROVED_BATCH) reject();
  let body;
  try {
    body =
      typeof operation.request === "string"
        ? JSON.parse(operation.request)
        : operation.request;
  } catch {
    reject();
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) reject();
  if (operation.provider === "reef" && operation.kind === "catalog") {
    if (
      operation.credits !== 1 ||
      !onlyKeys(body, ["vehicle_type"]) ||
      body.vehicle_type !== "car"
    )
      reject();
    return {
      url: "https://api.reefapi.com/webmotors/v1/makes_models",
      body,
      credential: "REEF_API_KEY",
      header: "x-api-key",
    };
  }
  if (operation.provider === "reef" && operation.kind === "validation") {
    if (
      operation.credits !== 2 ||
      !onlyKeys(body, ["make", "model", "page", "page_size", "location"]) ||
      !text(body.make) ||
      !text(body.model) ||
      body.page !== 1 ||
      body.page_size !== 10
    )
      reject();
    if (
      body.location !== undefined &&
      (!text(body.location, 100) ||
        !/^[a-z]{2}(?:-[a-z0-9]+)*$/.test(body.location) ||
        !states.includes(body.location.slice(0, 2)))
    )
      reject();
    return {
      url: "https://api.reefapi.com/webmotors/v1/search",
      body,
      credential: "REEF_API_KEY",
      header: "x-api-key",
    };
  }
  if (operation.provider === "gecko" && operation.kind === "validation") {
    if (
      operation.credits !== 1 ||
      !onlyKeys(body, ["target", "type", "url"]) ||
      body.target !== "olx.com.br" ||
      body.type !== "plp" ||
      !validOlxValidationUrl(body.url)
    )
      reject();
    return {
      url: "https://api.geckoapi.com.br/v1/extract",
      body,
      credential: "GECKO_API_KEY",
      header: "Authorization",
    };
  }
  reject();
}

/** Includes queued, running and failed jobs: failures do not release approval. */
export function assertBatchBudget(operations) {
  const totals = { reef: 0, gecko: 0 };
  if (operations.length > MAX_OPERATIONS)
    reject("approved_batch_budget_exceeded");
  for (const operation of operations) {
    if (
      operation.batchId !== APPROVED_BATCH ||
      !Object.hasOwn(APPROVED_CAPS, operation.provider) ||
      !Number.isSafeInteger(operation.credits) ||
      operation.credits < 1
    )
      reject("invalid_approved_batch");
    totals[operation.provider] += operation.credits;
  }
  if (totals.reef > APPROVED_CAPS.reef || totals.gecko > APPROVED_CAPS.gecko)
    reject("approved_batch_budget_exceeded");
  return totals;
}

const scalar = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : text(value, 300)
      ? value
      : null;
const publicListingUrl = (value, provider) => {
  try {
    const url = new URL(value);
    const domain = provider === "reef" ? "webmotors.com.br" : "olx.com.br";
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !(url.hostname === domain || url.hostname.endsWith(`.${domain}`))
    )
      return null;
    if (
      provider === "reef"
        ? !url.pathname.startsWith("/comprar/")
        : !url.pathname.includes("/autos-e-pecas/carros-vans-e-utilitarios/")
    )
      return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

/** Catalog structure is retained for inspection, with sensitive metadata removed. */
function publicCatalog(value, depth = 0) {
  if (depth > 15) reject("provider_response_too_deep");
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  )
    return value;
  if (Array.isArray(value))
    return value.map((item) => publicCatalog(item, depth + 1));
  return Object.fromEntries(
    Object.entries(object(value))
      .filter(
        ([key]) =>
          !/authorization|api.?key|token|headers|cookie|seller|contact|phone|email|cpf|cnpj|address|whatsapp/i.test(
            key,
          ),
      )
      .map(([key, item]) => [key, publicCatalog(item, depth + 1)]),
  );
}

export function sanitizeOperationResponse(operation, payload) {
  if (operation.kind === "catalog") return publicCatalog(payload);
  const data = object(object(payload).data);
  const sourceRows = operation.provider === "reef" ? data.listings : data.items;
  if (!Array.isArray(sourceRows)) reject("provider_response_schema_unexpected");
  return {
    received: sourceRows.length,
    total: scalar(
      operation.provider === "reef" ? data.total_results : data.totalResults,
    ),
    records: sourceRows.slice(0, 100).map((raw) => {
      const row = object(raw);
      if (operation.provider === "reef")
        return {
          id: scalar(row.listing_id),
          url: publicListingUrl(row.url, "reef"),
          brand: scalar(row.make),
          model: scalar(row.model),
          version: scalar(row.trim ?? row.version),
          brandId: scalar(row.make_id),
          modelId: scalar(row.model_id),
          versionId: scalar(row.trim_id),
        };
      const attributes = Object.fromEntries(
        (Array.isArray(row.properties) ? row.properties : []).map((item) => [
          object(item).name,
          object(item).value,
        ]),
      );
      return {
        id: scalar(row.id),
        url: publicListingUrl(row.url, "gecko"),
        brand: scalar(attributes.vehicle_brand),
        model: scalar(attributes.vehicle_model),
        version: scalar(attributes.vehicle_version),
        brandId: scalar(attributes.vehicle_brand_id),
        modelId: scalar(attributes.vehicle_model_id),
        versionId: scalar(attributes.vehicle_version_id),
      };
    }),
  };
}

export async function performOperation(operation, key, fetcher = fetch) {
  const request = operationRequest(operation);
  if (!text(key, 4096)) reject("provider_credential_unavailable");
  try {
    const response = await fetcher(request.url, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        [request.header]:
          request.header === "Authorization" ? `Bearer ${key}` : key,
      },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) reject(`provider_http_${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) reject("provider_response_schema_unexpected");
    let size = 0;
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 5 * 1024 * 1024) {
        await reader.cancel();
        reject("provider_response_too_large");
      }
      chunks.push(value);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (object(payload).ok === false || object(payload).success === false)
      reject("provider_rejected_operation");
    return sanitizeOperationResponse(operation, payload);
  } catch (error) {
    if (error instanceof OperationError) throw error;
    reject("provider_request_failed");
  }
}

/** Transaction + advisory lock serialize budget validation, claim and credit reservation. */
export async function claimNextOperation(client, credentials) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `provider-operations:${APPROVED_BATCH}`,
    ]);
    const { rows } = await client.query(
      'SELECT * FROM "ProviderOperation" WHERE "batchId"=$1 ORDER BY "createdAt", id FOR UPDATE',
      [APPROVED_BATCH],
    );
    assertBatchBudget(rows);
    const operation = rows.find((row) => row.status === "queued");
    if (!operation) {
      await client.query("COMMIT");
      return null;
    }
    let request;
    try {
      request = operationRequest(operation);
      if (!text(credentials[request.credential], 4096))
        reject("provider_credential_unavailable");
    } catch (error) {
      const code =
        error instanceof OperationError
          ? error.code
          : "invalid_approved_operation";
      await client.query(
        "UPDATE \"ProviderOperation\" SET status='failed', error=$2, \"completedAt\"=now() WHERE id=$1 AND status='queued'",
        [operation.id, code],
      );
      await client.query("COMMIT");
      return { skipped: true, id: operation.id };
    }
    const claim = await client.query(
      "UPDATE \"ProviderOperation\" SET status='running', error=NULL WHERE id=$1 AND status='queued' RETURNING id",
      [operation.id],
    );
    if (claim.rowCount !== 1) reject("operation_claim_failed");
    await client.query(
      'INSERT INTO "ProviderSpend" (provider,credits,"createdAt") VALUES ($1,$2,now())',
      [operation.provider, operation.credits],
    );
    await client.query("COMMIT");
    return { operation, request };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
