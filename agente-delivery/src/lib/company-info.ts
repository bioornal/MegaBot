type CompanyInfoRow = {
  id?: number;
  categoria?: string | null;
  informacion?: string | null;
  updated_at?: string | null;
};

const CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_TABLE = "info_empresa";

let cache:
  | {
      expiresAt: number;
      context: string;
    }
  | null = null;

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function getConfig() {
  return {
    url: env("SUPABASE_URL", env("NEXT_PUBLIC_SUPABASE_URL")).replace(/\/+$/, ""),
    anonKey: env("SUPABASE_ANON_KEY", env("NEXT_PUBLIC_SUPABASE_ANON_KEY")),
    table: env("SUPABASE_COMPANY_INFO_TABLE", DEFAULT_TABLE),
  };
}

export async function getCompanyInfoContext(): Promise<string> {
  if (cache && cache.expiresAt > Date.now()) return cache.context;

  const config = getConfig();
  if (!config.url || !config.anonKey || !config.table) return "";

  try {
    const endpoint = new URL(`${config.url}/rest/v1/${config.table}`);
    endpoint.searchParams.set("select", "categoria,informacion,updated_at");
    endpoint.searchParams.set("order", "categoria.asc,id.asc");

    const res = await fetch(endpoint, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase company info error ${res.status}: ${body}`);
    }

    const rows = (await res.json()) as CompanyInfoRow[];
    const lines = rows
      .filter((row) => row.categoria && row.informacion)
      .map((row) => `- ${row.categoria}: ${row.informacion}`);

    const context =
      lines.length > 0
        ? [
            "INFO EMPRESA SUPABASE - fuente de verdad para datos de la empresa:",
            ...lines,
            "Usá esta información para responder sobre horarios, marcas, categorías, ubicación, entregas, financiación y condiciones comerciales. Si falta un dato, decí que lo confirma un asesor.",
          ].join("\n")
        : "";

    cache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      context,
    };
    return context;
  } catch (err) {
    console.error("[company-info] Error consultando Supabase:", err);
    return [
      "INFO EMPRESA SUPABASE:",
      "No se pudo consultar la información de la empresa en este momento.",
      "No inventes horarios, dirección, financiación ni condiciones. Derivá a un asesor para confirmar.",
    ].join("\n");
  }
}
