/** FIPE identifies complete model/trim records, not the textual model query. */
export type CatalogOption = { code: string; name: string };
export type CatalogBrandOption = CatalogOption & { searchName: string };
export type CatalogModelOption = CatalogOption & {
  searchName: string;
  versions: CatalogOption[];
};

const clean = (value: string) => value.trim().replace(/\s+/g, " ");
const key = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Query aliases; callers retain the original FIPE name and code separately. */
export function catalogBrandSearchName(name: string) {
  const aliases: Record<string, string> = {
    vw: "Volkswagen",
    "vw volkswagen": "Volkswagen",
    volkswagen: "Volkswagen",
    gm: "Chevrolet",
    "gm chevrolet": "Chevrolet",
    chevrolet: "Chevrolet",
    "kia motors": "Kia",
    kia: "Kia",
    mercedes: "Mercedes-Benz",
    "mercedes benz": "Mercedes-Benz",
  };
  return aliases[key(name)] ?? clean(name);
}

// Parsing hints, not catalog options. Every returned name is derived from a
// record received from the source. Unknown compound names remain intact until
// a recognized specification/trim boundary; manual entry covers ambiguity.
const compoundModel =
  /^(?:corolla (?:cross|fielder)|onix plus|cruze sport6|palio weekend|duster oroch|etios cross|grand (?:vitara(?: xl-7)?|cherokee|livina|sc[eé]nic|saveiro)|range rover(?: (?:sport|evoque|velar))?|land cruiser(?: prado)?|new (?:beetle|civic|fiesta|march)|pajero (?:full|sport|tr4|io)|lancer sportback|outlander sport|eclipse cross|discovery sport|santa f[eé]|hb20(?:s|x)?|sandero stepway|clio sedan|m[eé]gane grand tour|golf variant|jetta variant|passat variant|tiguan allspace|up!|c4 (?:cactus|lounge|pallas|picasso)|c3 (?:aircross|picasso)|aircross|freelander 2|defender (?:90|110|130)|discovery [1-5]|dolphin (?:mini|plus)|song (?:plus|pro)|yuan (?:plus|pro)|haval h6|ora 03|tiggo (?:[2-9](?:x)?)(?: pro)?|arrizo [3-8])(?=$|\s)/i;
const trimBoundary =
  /^(?:(?:cd|cs|highline)\d[.,]|\d+[.,]\d|\d{3,4}(?:i|cc)?$|\d+v$|\d+p$|v[6-9]$|16v|8v|turbo$|diesel$|flex$|hybrid$|h[ií]brido$|el[eé]trico$|aut\.?$|mec\.?$|cv[t]?\.?$|(?:gl|gls|gli|glx|glt|gti|gts|cl|cli|clx|lx|lxl|ex|exl|exr|exs|xei|xli|xrs|xre|xrx|altis|se|sel|ses|sl|slt|sls|sr|srv|srx|lt|ltz|lts|le|xl|xls|xlt|xr|xs|xt|xsi|tsx|titanium|limited|laredo|longitude|overland|rubicon|sahara|sport|sporting|highline|trendline|comfortline|comfort\.?|comfor\.?|high\.?|hig\.?|highli\.?|sense|advance|active|allure|griffe|premier|premium|prestige|platinum|elegance|exclusive|expression|authentique|dynamique|intense|intens|iconic|zen|life|vibe|live|style|drive|attractive|essence|essencial|adventure|way|freedom|volcano|endurance|extreme|black|power|rallye|rally|trend|plus|prime|connect|xtreme|track|city|cab\.?|cd|cs|chassis|standard|furg[aã]o|lotação|escolar)(?:[./]|$))/i;
// Touring can be a wagon identity on other makes, so do not strip it globally.
const hondaTrim =
  /^(civic|accord|fit|city|cr-v|hr-v|wr-v)\s+(?:touring|si|type[ -]r)(?=$|[\s./])/i;
// A body label can follow a technical qualifier (for example CGI Coupé).
// Keep the entire prefix through the body; removing interior words would invent
// an equivalence and break the source trim slicing contract.
const mercedesBody = /\s(?:coup[eé]|cabriolet|touring|sw)(?=$|\s)/i;
const mercedesSeries =
  /^(?:C|A|E|S|CL|CLA|CLK|CLS|SL|SLC|SLK|GLA|GLB|GLC|GLE|GLS|ML|GL)[ -]?\d{2,3}(?=$|\s)/i;

/** Return a prefix of the whitespace-normalized source, so trim slicing is safe. */
export function catalogModelFamily(name: string) {
  const value = clean(name);
  const compound = value.match(compoundModel)?.[0];
  if (compound) return compound;
  const series = value.match(mercedesSeries)?.[0];
  if (series) {
    const suffix = value.slice(series.length);
    const body = suffix.match(mercedesBody);
    return body
      ? value.slice(0, series.length + body.index! + body[0].length)
      : series;
  }
  const hondaModel = value.match(hondaTrim)?.[1];
  if (hondaModel) return hondaModel;
  const tokens = value.split(" ");
  const boundary = tokens.findIndex(
    (token, index) =>
      index > 0 && (trimBoundary.test(token) || /^\(/.test(token)),
  );
  return tokens.slice(0, boundary < 0 ? tokens.length : boundary).join(" ");
}

// The C 180 / C-180 / C180 query equivalence already exists in the search layer.
// Keep it here too without changing the prefix returned for source trim slicing.
function modelSearchName(family: string) {
  return family.replace(/^c[ -]?180(?=$|\s)/i, "C180");
}

type Row = Record<string, unknown>;
function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new Error("Formato de catálogo inválido.");
  return value.filter((row): row is Row =>
    Boolean(row && typeof row === "object" && !Array.isArray(row)),
  );
}
function option(
  row: Row,
  codeKey: string,
  nameKey: string,
): CatalogOption | null {
  const code = String(row[codeKey] ?? "");
  const name = row[nameKey];
  return /^\d{1,10}$/.test(code) && typeof name === "string" && name.trim()
    ? { code, name: clean(name) }
    : null;
}
function uniqueOptions(items: (CatalogOption | null)[]) {
  const unique = new Map<string, CatalogOption>();
  for (const item of items)
    if (item && !unique.has(item.code)) unique.set(item.code, item);
  if (!unique.size) throw new Error("O catálogo não retornou opções válidas.");
  return [...unique.values()];
}
export function parseCatalogBrands(value: unknown): CatalogBrandOption[] {
  return uniqueOptions(rows(value).map((row) => option(row, "codigo", "nome")))
    .map((item) => ({ ...item, searchName: catalogBrandSearchName(item.name) }))
    .sort((a, b) => a.searchName.localeCompare(b.searchName, "pt-BR"));
}
export function parseCatalogModels(value: unknown): CatalogModelOption[] {
  if (!value || typeof value !== "object" || !("modelos" in value))
    throw new Error("Formato de catálogo inválido.");
  const versions = uniqueOptions(
    rows(value.modelos).map((row) => option(row, "codigo", "nome")),
  );
  const families = new Map<string, CatalogModelOption>();
  for (const version of versions) {
    const name = catalogModelFamily(version.name);
    const searchName = modelSearchName(name);
    // A family key is UI identity only, never a FIPE model code.
    const code = `family:${key(searchName)}`;
    const existing = families.get(code);
    if (existing) existing.versions.push(version);
    else families.set(code, { code, name, searchName, versions: [version] });
  }
  return [...families.values()]
    .map((family) => ({
      ...family,
      versions: family.versions.sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR"),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
export function parseCatalogCities(value: unknown): CatalogOption[] {
  return uniqueOptions(
    rows(value).map((row) => option(row, "id", "nome")),
  ).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
