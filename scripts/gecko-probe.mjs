// Manual free-tier proof, one extraction per invocation; never imported by the app.
import { mkdirSync, writeFileSync } from "node:fs";
process.loadEnvFile(".env.gecko.local");
const cases = {
  "olx-url-page2": {
    target: "olx.com.br",
    type: "plp",
    url: "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/toyota/corolla/estado-pr/regiao-de-curitiba-e-paranagua?o=2",
  },
  "olx-detail": {
    target: "olx.com.br",
    type: "pdp",
    url: "https://pr.olx.com.br/regiao-de-curitiba-e-paranagua/autos-e-pecas/carros-vans-e-utilitarios/toyota-corolla-2-0-xei-16v-flex-4p-automatico-2020-1486927605",
  },
  "webmotors-detail": {
    target: "webmotors.com.br",
    type: "pdp",
    url: "https://www.webmotors.com.br/comprar/toyota/corolla/20-vvt-ie-flex-xei-direct-shift/4-portas/2019-2020/80767975?lkid=4668",
  },
  "olx-url": {
    target: "olx.com.br",
    type: "plp",
    url: "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/toyota/corolla/estado-pr/regiao-de-curitiba-e-paranagua",
  },
  "webmotors-url": {
    target: "webmotors.com.br",
    type: "plp",
    city: "Curitiba",
    state: "PR",
    url: "https://www.webmotors.com.br/carros-usados/pr-curitiba/toyota/corolla",
  },
  "olx-control": {
    target: "olx.com.br",
    type: "plp",
    categoryPath: "autos-e-pecas/carros-vans-e-utilitarios",
    keyword: "Corolla",
    state: "PR",
    city: "Curitiba",
    sort: "date",
  },
  "webmotors-control": {
    target: "webmotors.com.br",
    type: "plp",
    vehicleType: "car",
    usedCars: true,
    newCars: false,
    make: "Toyota",
    model: "Corolla",
    yearMin: 2020,
    yearMax: 2020,
    state: "PR",
    city: "Curitiba",
  },
  "olx-bmw": {
    target: "olx.com.br",
    type: "plp",
    categoryPath: "autos-e-pecas/carros-vans-e-utilitarios",
    keyword: "BMW 320i",
    state: "SC",
    city: "Blumenau",
    priceMax: 120000,
    sort: "date",
  },
  "webmotors-bmw": {
    target: "webmotors.com.br",
    type: "plp",
    vehicleType: "car",
    usedCars: true,
    newCars: false,
    make: "BMW",
    model: "320i",
    priceMax: 120000,
    mileageMax: 60000,
    state: "SC",
    city: "Blumenau",
  },
};
const name = process.argv[2];
const page = Number(process.argv[3] ?? 1);
const transport = process.argv[4] ?? "rest";
if (!["rest", "mcp"].includes(transport))
  throw new Error("Transporte inválido.");
if (!cases[name] || ![1, 2].includes(page))
  throw new Error("Use um caso documentado e página 1 ou 2.");
if (cases[name].url && page !== 1)
  throw new Error(
    "Com URL, usar a paginação retornada pela origem; não misturar page.",
  );
const key = process.env.GECKO_API_KEY?.trim();
if (!key) throw new Error("Chave local ausente.");
const headers = {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};
async function request(path, body) {
  const response = await fetch(`https://api.geckoapi.com.br${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  return { status: response.status, data: await response.json() };
}
try {
  const before = await request("/v1/me/credits");
  if (
    before.status !== 200 ||
    before.data.planId !== "free" ||
    !Number.isFinite(before.data.currentCredits) ||
    before.data.currentCredits < 1 ||
    before.data.currentCredits > 100
  )
    throw new Error("Saldo ou plano fora dos limites da prova gratuita.");
  const catalog = await request("/v1/mcp", {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  const toolName = `${cases[name].target.replaceAll(".", "_")}_${cases[name].type}`;
  const tool = catalog.data.result?.tools?.find(
    (item) => item.name === toolName,
  );
  if (
    catalog.status !== 200 ||
    !/Current cost: 1 credit\./.test(tool?.description ?? "")
  )
    throw new Error(
      "Custo atual de 1 crédito não confirmado no catálogo. Não executar.",
    );
  const start = performance.now();
  const { target, type, ...args } = cases[name];
  const input = { ...args, ...(type === "plp" && !args.url ? { page } : {}) };
  const result =
    transport === "mcp"
      ? await request("/v1/mcp", {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: toolName, arguments: input },
        })
      : await request("/v1/extract", { target, type, ...input });
  if (transport === "mcp" && result.data.result?.structuredContent)
    result.data = result.data.result.structuredContent;
  const elapsedMs = Math.round(performance.now() - start);
  mkdirSync("validation-private", { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const file = `validation-private/${stamp}-${name}-p${page}-${transport}.json`;
  writeFileSync(
    file,
    JSON.stringify(
      {
        observedAt: stamp,
        input: { ...cases[name], page },
        httpStatus: result.status,
        elapsedMs,
        response: result.data,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const after = await request("/v1/me/credits");
  console.log(
    JSON.stringify(
      {
        case: name,
        page,
        httpStatus: result.status,
        elapsedMs,
        creditsBefore: before.data.currentCredits,
        creditsAfter: after.status === 200 ? after.data.currentCredits : null,
        responseKeys: Object.keys(result.data),
        dataKeys: result.data.data ? Object.keys(result.data.data) : [],
        file,
      },
      null,
      2,
    ),
  );
  if (result.status !== 200 || after.status !== 200) process.exitCode = 1;
} catch {
  console.error(
    "Prova interrompida: rede, saldo, custo ou resposta incompatível. Nenhuma repetição automática; conferir saldo antes de nova tentativa.",
  );
  process.exitCode = 1;
}
