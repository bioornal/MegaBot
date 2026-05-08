const CACHE_TTL_MS = 60_000;
const COMPANY_CACHE_TTL_MS = 5 * 60_000;

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function getInsforgeConfig() {
  return {
    url: env('INSFORGE_URL').replace(/\/+$/, ''),
    anonKey: env('INSFORGE_ANON_KEY'),
  };
}

interface MenuItemRow {
  id: string;
  nombre: string;
  precio: number;
  disponible: boolean;
  categoria: string;
}

interface CompanyInfoRow {
  id: string;
  categoria: string;
  informacion: string;
  updated_at: string;
}

// ── Menu cache ──
const menuCache = new Map<string, { expiresAt: number; items: MenuItemRow[] }>();

export async function fetchMenuItems(): Promise<MenuItemRow[]> {
  const cached = menuCache.get('menu');
  if (cached && cached.expiresAt > Date.now()) return cached.items;

  const config = getInsforgeConfig();
  if (!config.url || !config.anonKey) return [];

  const endpoint = new URL(`${config.url}/api/database/records/productos`);
  endpoint.searchParams.set('select', 'id,nombre,precio,disponible,categoria');
  endpoint.searchParams.set('order', 'categoria.asc,nombre.asc');
  endpoint.searchParams.set('limit', '100');

  const res = await fetch(endpoint, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
  });

  if (!res.ok) {
    console.error('[insforge] menu fetch error:', res.status, await res.text());
    return [];
  }

  const body = await res.json();
  const items: MenuItemRow[] = Array.isArray(body) ? body : (body.value ?? []);
  menuCache.set('menu', { expiresAt: Date.now() + CACHE_TTL_MS, items });
  return items;
}

// ── Company info cache ──
const companyCache = new Map<string, { expiresAt: number; context: string }>();

async function fetchCompanyInfo(): Promise<string> {
  const cached = companyCache.get('info');
  if (cached && cached.expiresAt > Date.now()) return cached.context;

  const config = getInsforgeConfig();
  if (!config.url || !config.anonKey) return '';

  const endpoint = new URL(`${config.url}/api/database/records/info_empresa_impasto`);
  endpoint.searchParams.set('select', 'categoria,informacion');
  endpoint.searchParams.set('order', 'categoria.asc');

  const res = await fetch(endpoint, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
  });

  if (!res.ok) {
    console.error('[insforge] company info fetch error:', res.status, await res.text());
    return '';
  }

  const body = await res.json();
  const rows: CompanyInfoRow[] = Array.isArray(body) ? body : (body.value ?? []);
  const lines = rows
    .filter((r) => r.categoria && r.informacion)
    .map((r) => `- ${r.categoria}: ${r.informacion}`);

  const context =
    lines.length > 0
      ? [
          'INFO EMPRESA INSFORGE - fuente de verdad para datos de la empresa:',
          ...lines,
          'Usá esta información para responder sobre horarios, dirección, delivery, formas de pago y datos del local.',
        ].join('\n')
      : '';

  companyCache.set('info', { expiresAt: Date.now() + COMPANY_CACHE_TTL_MS, context });
  return context;
}

function formatPrice(num: number): string {
  return `$${num.toLocaleString('es-AR')}`;
}

export async function getMenuContextFromInsforge(query: string): Promise<string> {
  try {
    const items = await fetchMenuItems();
    if (items.length === 0) return '';

    const q = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    // Expandir sinónimos en la query
    const synonyms: Record<string, string[]> = {
      'lomito': ['lomo'],
      'sandwich de lomo': ['lomo'],
      'sandwich de lomito': ['lomo'],
      'burguer': ['hamburguesa'],
      'burger': ['hamburguesa'],
      'hamburgesa': ['hamburguesa'],
      'muzza': ['muzzarela'],
      'mozzarella': ['muzzarela'],
      'fugaceta': ['fugazzeta'],
      'napolitana': ['napolitana'],
      'empanada': ['empanadas'],
      'empanadas': ['empanadas'],
      'pizza': ['pizzas'],
      'calzone': ['calzones'],
    };

    let expandedQuery = q;
    for (const [synon, targets] of Object.entries(synonyms)) {
      if (q.includes(synon)) {
        expandedQuery += ' ' + targets.join(' ');
      }
    }

    const tokens = expandedQuery
      .split(/[^a-z0-9]+/i)
      .filter((t) => t.length >= 3);

    const isGeneralQuery = tokens.length === 0 ||
      q.includes('sabor') || q.includes('que tienen') || q.includes('que venden') ||
      q.includes('menu') || q.includes('catalogo') || q.includes('que hay') ||
      q.includes('cuales hay') || q.includes('cuales son') || q.includes('opciones') ||
      q.includes('todo') || q.includes('que pido') || q.includes('que se puede') ||
      q.includes('hay ') || q.includes('tenes ') || q.includes('qué tenés') ||
      q.includes('qué hay') || q.includes('cuánto') || q.includes('precio');

    let filtered = items;
    if (!isGeneralQuery) {
      const mentionsEmpanada = q.includes('empanada');
      const mentionsPizza = q.includes('pizza');
      const mentionsLomo = q.includes('lomo') || q.includes('lomito') || q.includes('sandwich');
      const mentionsHamburguesa = q.includes('hamburguesa') || q.includes('burger') || q.includes('burguer');
      const mentionsCalzone = q.includes('calzone');

      const categoriesMentioned = [mentionsEmpanada, mentionsPizza, mentionsLomo, mentionsHamburguesa, mentionsCalzone].filter(Boolean).length;

      if (categoriesMentioned <= 1) {
        if (mentionsEmpanada) {
          filtered = items.filter((i) => i.categoria === 'empanadas');
        } else if (mentionsPizza) {
          filtered = items.filter((i) => i.categoria === 'pizzas');
        } else if (mentionsLomo) {
          filtered = items.filter((i) => i.categoria === 'lomos');
        } else if (mentionsHamburguesa) {
          filtered = items.filter((i) => i.categoria === 'hamburguesas');
        } else if (mentionsCalzone) {
          filtered = items.filter((i) => i.categoria === 'calzones');
        }
      }
      // Si se mencionan varias categorías, no filtrar (mostrar todo)
    }

    const scored = filtered
      .map((item) => {
        const name = item.nombre
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        const score = tokens.reduce((acc, token) => {
          if (name.includes(token)) return acc + 5;
          return acc;
        }, 0);
        return { item, score };
      })
      .filter((s) => s.score > 0 || tokens.length === 0)
      .sort((a, b) => b.score - a.score);

    const displayItems = isGeneralQuery
      ? filtered
      : scored.length > 0
        ? scored.slice(0, 20).map((s) => s.item)
        : items;

    const pizzas = displayItems.filter((i) => i.categoria === 'pizzas');
    const empanadas = displayItems.filter((i) => i.categoria === 'empanadas');
    const calzones = displayItems.filter((i) => i.categoria === 'calzones');
    const hamburguesas = displayItems.filter((i) => i.categoria === 'hamburguesas');
    const lomos = displayItems.filter((i) => i.categoria === 'lomos');
    const otros = displayItems.filter((i) => i.categoria === 'otros');

    const lines: string[] = ['CATALOGO INSFORGE - Menú de Impasto:'];

    if (pizzas.length > 0) {
      lines.push('--- PIZZAS ---');
      for (const p of pizzas) lines.push(`- ${p.nombre} | ${formatPrice(p.precio)}`);
    }
    if (empanadas.length > 0) {
      lines.push('--- EMPANADAS ---');
      for (const e of empanadas) lines.push(`- ${e.nombre} | ${formatPrice(e.precio)}`);
    }
    if (calzones.length > 0) {
      lines.push('--- CALZONES ---');
      for (const c of calzones) lines.push(`- ${c.nombre} | ${formatPrice(c.precio)}`);
    }
    if (hamburguesas.length > 0) {
      lines.push('--- HAMBURGUESAS ---');
      for (const h of hamburguesas) lines.push(`- ${h.nombre} | ${formatPrice(h.precio)}`);
    }
    if (lomos.length > 0) {
      lines.push('--- LOMOS ---');
      for (const l of lomos) lines.push(`- ${l.nombre} | ${formatPrice(l.precio)}`);
    }
    if (otros.length > 0) {
      lines.push('--- OTROS ---');
      for (const o of otros) lines.push(`- ${o.nombre} | ${formatPrice(o.precio)}`);
    }

    return lines.join('\n');
  } catch (err) {
    console.error('[insforge] getMenuContext error:', err);
    return '';
  }
}

export async function getCompanyInfoFromInsforge(): Promise<string> {
  try {
    return await fetchCompanyInfo();
  } catch (err) {
    console.error('[insforge] getCompanyInfo error:', err);
    return '';
  }
}

export async function savePedidoToInsforge(pedido: {
  nombre_cliente: string;
  telefono_cliente: string;
  direccion: string;
  productos: Array<{ name: string; qty: number; unitPrice: number }>;
  total: number;
  metodo_pago: string;
  tipo_entrega: string;
}): Promise<boolean> {
  try {
    const config = getInsforgeConfig();
    if (!config.url || !config.anonKey) return false;

    const res = await fetch(`${config.url}/api/database/records/pedidos`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([{
        nombre_cliente: pedido.nombre_cliente,
        telefono_cliente: pedido.telefono_cliente,
        direccion: pedido.direccion,
        productos: pedido.productos,
        total: pedido.total,
        metodo_pago: pedido.metodo_pago,
        tipo_entrega: pedido.tipo_entrega,
        status: 'pendiente',
        fecha: new Date().toISOString(),
      }]),
    });

    if (!res.ok) {
      console.error('[insforge] save pedido error:', res.status, await res.text());
      return false;
    }
    console.log('[insforge] Pedido guardado OK');
    return true;
  } catch (err) {
    console.error('[insforge] save pedido error:', err);
    return false;
  }
}

export async function getPricesMap(): Promise<Record<string, number>> {
  try {
    const items = await fetchMenuItems();
    const map: Record<string, number> = {};
    for (const item of items) {
      map[item.nombre] = item.precio;
    }
    return map;
  } catch (err) {
    console.error('[insforge] getPricesMap error:', err);
    return {};
  }
}
