import * as cache from './cache';

const WIKI_PAGES = [
  'Cataratas_del_Iguaz%C3%BA',
  'Puerto_Iguaz%C3%BA',
  'Parque_Nacional_Iguaz%C3%BA',
  'Provincia_de_Misiones',
  'Triple_Frontera',
  'Ruinas_de_San_Ignacio_Min%C3%AD',
];

const WIKI_API = 'https://es.wikipedia.org/api/rest_v1/page/summary/';

interface WikiSummary {
  title: string;
  extract: string;
}

async function fetchWikiSummary(page: string): Promise<WikiSummary | null> {
  try {
    const res = await fetch(`${WIKI_API}${page}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.extract) return null;
    return { title: data.title || page, extract: data.extract };
  } catch {
    return null;
  }
}

const WIKI_CACHE_KEY = 'iguazu_wiki_context';
const WIKI_CACHE_TTL_MS = 6 * 60 * 60_000; // 6 hours

export async function getIguazuWikiContext(): Promise<string> {
  const cached = cache.get(WIKI_CACHE_KEY);
  if (cached) return cached;

  const results = await Promise.all(WIKI_PAGES.map(fetchWikiSummary));
  const valid = results.filter((r): r is WikiSummary => r !== null);

  if (valid.length === 0) {
    const fallback = cache.get(WIKI_CACHE_KEY);
    return fallback ?? '';
  }

  const lines = valid.map(r => `**${r.title}**: ${r.extract}`);
  const context = [
    'INFO ZONA Cataratas del Iguazú — contexto geográfico, turístico e histórico (fuente: Wikipedia):',
    ...lines,
    'Usá esta información para responder preguntas generales sobre la zona, las cataratas, el parque nacional, Puerto Iguazú, Misiones, la Triple Frontera y Ruinas de San Ignacio Miní. Si falta un dato, decí que lo confirma un asesor.',
  ].join('\n');

  cache.set(WIKI_CACHE_KEY, context, WIKI_CACHE_TTL_MS);
  return context;
}