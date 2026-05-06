type ProductRow = Record<string, unknown> & {
  categories?: { name?: string } | null;
};

const CACHE_TTL_MS = 60_000;
const MAX_PRODUCTS = 1_000;
const MAX_CONTEXT_GROUPS = 12;
const MAX_GROUPS_PER_REQUESTED_ITEM = 3;
const MIN_VALID_OFFER_PRICE = 100;

const cache = new Map<string, { expiresAt: number; rows: ProductRow[] }>();

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function getSupabaseConfig(table?: string) {
  return {
    url: env("SUPABASE_URL", env("NEXT_PUBLIC_SUPABASE_URL")).replace(/\/+$/, ""),
    anonKey: env("SUPABASE_ANON_KEY", env("NEXT_PUBLIC_SUPABASE_ANON_KEY")),
    table: table ?? env("SUPABASE_PRODUCTS_TABLE", "products"),
    columns: {
      id: env("SUPABASE_PRODUCT_ID_COLUMN", "id"),
      name: env("SUPABASE_PRODUCT_NAME_COLUMN", "name"),
      brand: "brand",
      description: env("SUPABASE_PRODUCT_DESCRIPTION_COLUMN", "description"),
      categoryId: env("SUPABASE_PRODUCT_CATEGORY_COLUMN", "category_id"),
      price: env("SUPABASE_PRODUCT_PRICE_COLUMN", "price"),
      priceCash: "price_cash",
      stock: env("SUPABASE_PRODUCT_STOCK_COLUMN", "stock"),
      color: "color",
      active: env("SUPABASE_PRODUCT_ACTIVE_COLUMN", ""),
    },
  };
}

function textValue(row: ProductRow, column: string): string {
  if (!column) return "";
  const value = row[column];
  if (value === null || value === undefined) return "";
  return String(value);
}

function numberValue(row: ProductRow, column: string): number | null {
  const raw = textValue(row, column);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function getCategoryName(row: ProductRow): string {
  const cats = row.categories as unknown;
  if (cats && typeof cats === "object" && "name" in cats) {
    return String((cats as { name?: unknown }).name ?? "");
  }
  if (typeof cats === "string") return cats;
  return "";
}

function formatPrice(raw: string | number | null): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const num =
    typeof raw === "number"
      ? raw
      : Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num)) return String(raw);
  return `$${num.toLocaleString("es-AR")}`;
}

function priceNumber(raw: string | number | null): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const num =
    typeof raw === "number"
      ? raw
      : Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) ? num : null;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

//
// 🔥 FIX CLAVE — MAPEO REAL QUERY → CATEGORÍA DB
//
function detectCategoryFromQuery(query: string): string[] | null {
  const q = normalize(query);

  // 🛏️ dormitorio (sommiers + colchones)
  if (
    q.includes("sommier") ||
    q.includes("somier") ||
    q.includes("colchon") ||
    q.includes("colchón") ||
    q.includes("colchones")
  ) {
    return ["dormitorio"];
  }

  // 🛋️ living / sofás
  if (
    q.includes("sofa") ||
    q.includes("sofá") ||
    q.includes("sillon") ||
    q.includes("sillón")
  ) {
    return ["sofas", "living"];
  }

  // 🪑 sillas
  if (q.includes("silla") || q.includes("sillas")) {
    return ["comedor", "living"];
  }

  return null;
}

//
// 🔥 DETECCIÓN INTENCIÓN DE MARCAS
//
function isBrandQuery(query: string): boolean {
  const q = normalize(query);

  return (
    q.includes("marca") ||
    q.includes("marcas") ||
    q.includes("que marcas") ||
    q.includes("qué marcas") ||
    q.includes("trabajan")
  );
}

function isOfferQuery(query: string): boolean {
  const q = normalize(query);

  return (
    q.includes("oferta") ||
    q.includes("ofertas") ||
    q.includes("promo") ||
    q.includes("promocion") ||
    q.includes("promociones") ||
    q.includes("barato") ||
    q.includes("barata") ||
    q.includes("economico") ||
    q.includes("economica")
  );
}

async function fetchProductRows(config: ReturnType<typeof getSupabaseConfig>, select: string): Promise<{ ok: true; rows: ProductRow[] } | { ok: false; status: number; body: string }> {
  const endpoint = new URL(`${config.url}/rest/v1/${config.table}`);
  endpoint.searchParams.set("select", select);
  endpoint.searchParams.set("limit", String(MAX_PRODUCTS));

  const res = await fetch(endpoint, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body };
  }

  const rows = (await res.json()) as ProductRow[];
  return { ok: true, rows: Array.isArray(rows) ? rows : [] };
}

async function fetchProducts(table?: string): Promise<ProductRow[]> {
  const config = getSupabaseConfig(table);
  if (!config.url || !config.anonKey || !config.table) return [];

  const cached = cache.get(config.table);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  // Intento 1: embed de categories via FK (esquema legacy: products → categories)
  let result = await fetchProductRows(config, "*,categories(name)");

  // Si la tabla del tenant no tiene FK a categories (PGRST200), reintenta sin embed.
  // Las tablas products_{tenant} traen "categories" como columna jsonb.
  if (!result.ok && result.status === 400 && result.body.includes("PGRST200")) {
    console.warn(`[catalog] tabla "${config.table}" sin FK a categories — reintentando sin embed.`);
    result = await fetchProductRows(config, "*");
  }

  if (!result.ok) {
    throw new Error(`Supabase catalog error ${result.status}: ${result.body}`);
  }

  const entry = { expiresAt: Date.now() + CACHE_TTL_MS, rows: result.rows };
  cache.set(config.table, entry);
  return entry.rows;
}

interface ProductGroup {
  key: string;
  name: string;
  brand: string;
  categoryName: string;
  description: string;
  price: string;
  priceCash: string;
  variants: Array<{
    id: string;
    color: string;
    stock: number | null;
  }>;
}

interface RequestedCatalogItem {
  type: "colchon" | "sommier";
  quantity: number;
  sizeLabel: string;
  sizeTokens: string[];
  raw: string;
}

interface OfferTarget {
  label: string;
  matches: (group: ProductGroup) => boolean;
}

function groupByModel(rows: ProductRow[]): ProductGroup[] {
  const config = getSupabaseConfig();
  const groups = new Map<string, ProductGroup>();

  for (const row of rows) {
    const name = textValue(row, config.columns.name);
    const brand = textValue(row, config.columns.brand);
    const categoryName = getCategoryName(row);
    const description = textValue(row, config.columns.description);
    const price = textValue(row, config.columns.price);
    const priceCash = textValue(row, config.columns.priceCash);
    const id = textValue(row, config.columns.id);
    const color = textValue(row, config.columns.color);
    const stock = numberValue(row, config.columns.stock);

    const key = [
      normalize(name),
      normalize(brand),
      normalize(categoryName),
      price,
    ].join("||");

    const existing = groups.get(key);
    if (existing) {
      existing.variants.push({ id, color, stock });
    } else {
      groups.set(key, {
        key,
        name,
        brand,
        categoryName,
        description,
        price,
        priceCash,
        variants: [{ id, color, stock }],
      });
    }
  }

  return Array.from(groups.values());
}

function collapseDouble(text: string): string {
  return text.replace(/([a-z])\1+/g, "$1");
}

function matches(haystack: string, token: string): boolean {
  if (haystack.includes(token)) return true;
  if (token.length < 4) return false;

  const hCollapsed = collapseDouble(haystack);
  const tCollapsed = collapseDouble(token);

  if (hCollapsed.includes(tCollapsed)) return true;

  const stem = token.slice(0, -1);
  if (
    stem.length >= 4 &&
    haystack.split(" ").some(
      (w) =>
        w.startsWith(stem) || collapseDouble(w).startsWith(stem)
    )
  )
    return true;

  return false;
}

function scoreGroup(group: ProductGroup, queryTokens: string[]): number {
  const name = normalize(group.name);
  const brand = normalize(group.brand);
  const categoryName = normalize(group.categoryName);
  const description = normalize(group.description);
  const colors = group.variants.map((v) => normalize(v.color)).join(" ");

  const searchable = [name, brand, categoryName, description, colors].join(" ");

  return queryTokens.reduce((acc, token) => {
    if (!matches(searchable, token)) return acc;
    if (matches(name, token)) return acc + 5;
    if (matches(categoryName, token)) return acc + 4;
    if (matches(brand, token)) return acc + 3;
    if (matches(colors, token)) return acc + 2;
    return acc + 1;
  }, 0);
}

function parseQuantity(raw: string | undefined): number {
  if (!raw) return 1;

  const q = normalize(raw);
  const asNumber = Number(q);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;

  const words: Record<string, number> = {
    un: 1,
    una: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
  };

  return words[q] ?? 1;
}

function detectSize(raw: string): Pick<RequestedCatalogItem, "sizeLabel" | "sizeTokens"> | null {
  const q = normalize(raw);

  if (q.includes("plaza y media") || q.includes("1 plaza y media")) {
    return { sizeLabel: "plaza y media / 100 cm", sizeTokens: ["100", "1.00", "1,00"] };
  }

  if (
    q.includes("2 plazas") ||
    q.includes("dos plazas") ||
    q.includes("2 plaza") ||
    q.includes("matrimonial")
  ) {
    return { sizeLabel: "2 plazas / 140 cm", sizeTokens: ["140", "1.40", "1,40"] };
  }

  if (
    q.includes("1 plaza") ||
    q.includes("una plaza") ||
    q.includes("un plaza") ||
    q.includes("individual")
  ) {
    return { sizeLabel: "1 plaza / 80 cm", sizeTokens: ["80", "0.80", "0,80"] };
  }

  if (q.includes("queen")) {
    return { sizeLabel: "queen / 160 cm", sizeTokens: ["160", "1.60", "1,60"] };
  }

  if (q.includes("king")) {
    return { sizeLabel: "king / 200 cm", sizeTokens: ["200", "2.00", "2,00"] };
  }

  return null;
}

function detectRequestedCatalogItems(query: string): RequestedCatalogItem[] {
  const q = normalize(query);
  const itemPattern =
    /(?:^|\s)(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)?\s*(colchon(?:es)?|sommiers?|somier(?:es)?)/g;
  const matches = Array.from(q.matchAll(itemPattern));

  if (matches.length === 0) return [];

  return matches.flatMap((match, index) => {
    const productWord = match[2] ?? "";
    const type = productWord.startsWith("colchon") ? "colchon" : "sommier";
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? q.length;
    const raw = q.slice(start, end);
    const size = detectSize(raw);

    if (!size) return [];

    return [{
      type,
      quantity: parseQuantity(match[1]),
      sizeLabel: size.sizeLabel,
      sizeTokens: size.sizeTokens,
      raw: raw.trim(),
    }];
  });
}

function matchesRequestedType(group: ProductGroup, type: RequestedCatalogItem["type"]): boolean {
  const name = normalize(group.name);

  if (type === "colchon") {
    return name.includes("colchon") && !name.includes("cuna");
  }

  return (
    (name.includes("sommier") || name.includes("somier") || name.includes("conjunto")) &&
    !name.includes("colchon")
  );
}

function detectOfferTarget(query: string): OfferTarget | null {
  const q = normalize(query);

  if (q.includes("colchon") || q.includes("colchones")) {
    return {
      label: "colchón",
      matches: (group) => matchesRequestedType(group, "colchon"),
    };
  }

  if (q.includes("sommier") || q.includes("somier")) {
    return {
      label: "sommier",
      matches: (group) => matchesRequestedType(group, "sommier"),
    };
  }

  if (q.includes("silla") || q.includes("sillas")) {
    return {
      label: "silla",
      matches: (group) => {
        const name = normalize(group.name);
        const categoryName = normalize(group.categoryName);
        return name.includes("silla") || categoryName.includes("comedor");
      },
    };
  }

  if (q.includes("sofa") || q.includes("sillon")) {
    return {
      label: "sofá/sillón",
      matches: (group) => {
        const name = normalize(group.name);
        const categoryName = normalize(group.categoryName);
        return (
          name.includes("sofa") ||
          name.includes("sillon") ||
          categoryName.includes("sofa") ||
          categoryName.includes("living")
        );
      },
    };
  }

  return null;
}

function getOfferPrice(group: ProductGroup): number | null {
  const cash = priceNumber(group.priceCash);
  const list = priceNumber(group.price);
  const price = cash && cash > 0 ? cash : list;

  if (!price || price < MIN_VALID_OFFER_PRICE) return null;
  return price;
}

function findCheapestOfferGroups(groups: ProductGroup[], limit = 3): ProductGroup[] {
  return groups
    .map((group) => ({
      group,
      price: getOfferPrice(group),
    }))
    .filter((item): item is { group: ProductGroup; price: number } => item.price !== null)
    .sort((a, b) => a.price - b.price)
    .slice(0, limit)
    .map((item) => item.group);
}

function matchesRequestedSize(group: ProductGroup, sizeTokens: string[]): boolean {
  const name = normalize(group.name);
  const description = normalize(group.description);
  const hasSizeInName = /\b(80|100|140|160|200)\b|[012][.,](?:00|40|60|80)/.test(name);
  const searchable = hasSizeInName ? name : [name, description].join(" ");

  return sizeTokens.some((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^0-9])${escaped}([^0-9]|$)`).test(searchable);
  });
}

function findGroupsForRequestedItem(
  groups: ProductGroup[],
  item: RequestedCatalogItem,
  queryTokens: string[]
): ProductGroup[] {
  return groups
    .filter((group) => matchesRequestedType(group, item.type))
    .filter((group) => matchesRequestedSize(group, item.sizeTokens))
    .map((group) => ({
      group,
      score: scoreGroup(group, queryTokens),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_GROUPS_PER_REQUESTED_ITEM)
    .map((item) => item.group);
}

function formatGroup(group: ProductGroup): string {
  const priceLista = formatPrice(group.price);
  const priceEfectivo = formatPrice(group.priceCash);

  const priceLine =
    priceLista && priceEfectivo && priceLista !== priceEfectivo
      ? `Precio: ${priceLista} en cuotas | ${priceEfectivo} efectivo`
      : priceLista
        ? `Precio: ${priceLista}`
        : "";

  return `- ${group.name} | ${group.brand} | ${group.categoryName} | ${priceLine}`;
}

export async function getCatalogContext(query: string, table?: string): Promise<string> {
  const q = normalize(query);
  const config = getSupabaseConfig(table);

  try {
    const rows = await fetchProducts(table);
    if (rows.length === 0) return "";

    const tokens = tokenize(query);
    if (tokens.length === 0) return "";

    const activeRows = config.columns.active
      ? rows.filter((row) => row[config.columns.active])
      : rows;

    const groups = groupByModel(activeRows);

    // 🔥 FILTRO REAL POR CATEGORÍA
    const detectedCategory = detectCategoryFromQuery(query);

    let filteredGroups = groups;

    if (detectedCategory) {
      filteredGroups = groups.filter((g) => {
        const cat = normalize(g.categoryName);
        return detectedCategory.some((dc) => cat.includes(dc));
      });
    }

    // 🔥 FILTRO POR MARCAS: solo Super Espuma y Piero para colchones/sommiers
    const isBedroomQuery =
      q.includes("sommier") ||
      q.includes("somier") ||
      q.includes("colchon") ||
      q.includes("colchón") ||
      q.includes("colchones");

    if (isBedroomQuery) {
      const allowedBrands = ["super espuma", "piero"];
      filteredGroups = filteredGroups.filter((g) => {
        const brand = normalize(g.brand);
        return allowedBrands.some((b) => brand.includes(b));
      });
    }

    // 🔥 RESPUESTA DE MARCAS CORRECTA
    if (isBrandQuery(query)) {
      const brands = Array.from(
        new Set(filteredGroups.map((g) => g.brand).filter(Boolean))
      );

      return [
        "CATÁLOGO SUPABASE - marcas disponibles:",
        ...brands.map((b) => `- ${b}`),
      ].join("\n");
    }

    const requestedItems = detectRequestedCatalogItems(query);

    if (isOfferQuery(query)) {
      if (requestedItems.length > 0) {
        const sections = requestedItems.flatMap((item) => {
          const matches = findCheapestOfferGroups(
            filteredGroups
              .filter((group) => matchesRequestedType(group, item.type))
              .filter((group) => matchesRequestedSize(group, item.sizeTokens))
          );
          const title = `${item.type} ${item.sizeLabel}`;

          if (matches.length === 0) {
            return [`Oferta para ${title}\n- No se encontraron productos para esa medida.`];
          }

          return [
            [
              `Oferta para ${title}`,
              ...matches.map(formatGroup),
            ].join("\n"),
          ];
        });

        return [
          "CATÁLOGO SUPABASE - oferta detectada:",
          "El cliente pidió una oferta. Ofrecé la primera opción como la más económica del mismo tipo de producto solicitado.",
          "No digas que tiene descuento especial salvo que el catálogo lo indique; presentalo como la opción más económica disponible.",
          ...sections,
        ].join("\n");
      }

      const target = detectOfferTarget(query);

      if (target) {
        const matches = findCheapestOfferGroups(
          filteredGroups.filter((group) => target.matches(group))
        );

        if (matches.length === 0) {
          return `CATÁLOGO SUPABASE - oferta detectada:\nNo se encontraron ofertas para ${target.label}.`;
        }

        return [
          "CATÁLOGO SUPABASE - oferta detectada:",
          `El cliente pidió una oferta de ${target.label}. Ofrecé la primera opción como la más económica disponible del mismo tipo de producto.`,
          "No digas que tiene descuento especial salvo que el catálogo lo indique; presentalo como la opción más económica disponible.",
          ...matches.map(formatGroup),
        ].join("\n");
      }
    }

    if (requestedItems.length > 0) {
      const sections = requestedItems.flatMap((item) => {
        const matches = findGroupsForRequestedItem(filteredGroups, item, tokens);
        const title = `${item.quantity} x ${item.type} ${item.sizeLabel}`;

        if (matches.length === 0) {
          return [`Pedido: ${title}\n- No se encontraron productos para esa medida.`];
        }

        return [
          [
            `Pedido: ${title}`,
            ...matches.map(formatGroup),
          ].join("\n"),
        ];
      });

      return [
        "CATÁLOGO SUPABASE - pedido detectado:",
        "Usá la cantidad de cada pedido para calcular subtotales y total. No cambies la medida indicada por el cliente.",
        "Si hay varias opciones para un mismo pedido, calculá el presupuesto con la primera opción y mencioná las demás solo como alternativas.",
        ...sections,
      ].join("\n");
    }

    const matches = filteredGroups
      .map((group) => ({
        group,
        score: scoreGroup(group, tokens),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CONTEXT_GROUPS)
      .map((item) => item.group);

    if (matches.length === 0) {
      return "CATÁLOGO SUPABASE:\nNo se encontraron productos.";
    }

    return [
      "CATÁLOGO SUPABASE:",
      ...matches.map(formatGroup),
    ].join("\n");
  } catch (err) {
    console.error("[catalog] error:", err);
    return "";
  }
}
