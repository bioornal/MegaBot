// src/lib/cart.ts — Order tracking en memoria por conversación
// El carrito vive en memoria del worker. Se pierde en restart.

export interface CartItem {
  name: string;
  qty: number;
  unitPrice: number;
}

export interface Cart {
  items: CartItem[];
  deliveryFee: number;
  orderType: 'retiro' | 'delivery' | null;
}

export const DELIVERY_FEE = 5000;

// Map de nombre de producto → precio unitario default
export const DEFAULT_PRICES: Record<string, number> = {
  'Pizza Muzzarela': 15000,
  'Pizza Napolitana': 18000,
  'Pizza Fugazzeta': 16000,
  'Pizza Roquefort': 18000,
  'Pizza Calabresa': 16000,
  'Pizza Especial': 22000,
  'Pizza Carbonara': 20000,
  'Pizza 4 Quesos': 18000,
  'Lomo Completo': 15000,
  'Lomo Doble': 18000,
  'Lomo Super': 18000,
  'Hamburguesa Completa': 10000,
  'Empanada Carne': 3200,
  'Empanada Carne Dulce': 3200,
  'Empanada Pollo': 3200,
  'Empanada Roquefort': 3500,
  'Empanada Caprese': 3500,
  'Empanada Arabe': 3500,
  'Empanada Espinaca': 3200,
  'Empanada Jamón y Muzza': 3500,
  'Empanada Palmito': 3200,
};

type ProductCategory = 'pizza' | 'empanada' | 'lomo' | 'burger' | 'other';

function getProductCategory(name: string): ProductCategory {
  if (name.startsWith('Pizza ')) return 'pizza';
  if (name.startsWith('Empanada ')) return 'empanada';
  if (name.startsWith('Lomo ')) return 'lomo';
  if (name.startsWith('Hamburguesa ')) return 'burger';
  return 'other';
}

// Sinónimos → nombre canónico, con contexto de categoría
const SYNONYMS: Record<string, string> = {
  // Pizzas
  'fugazzeta': 'Pizza Fugazzeta',
  'fugaceta': 'Pizza Fugazzeta',
  'muzza': 'Pizza Muzzarela',
  'mozzarella': 'Pizza Muzzarela',
  'muzzarella': 'Pizza Muzzarela',
  'napolitana': 'Pizza Napolitana',
  'napo': 'Pizza Napolitana',
  'roquefort pizza': 'Pizza Roquefort',
  'roquefort': 'Pizza Roquefort',
  'especial pizza': 'Pizza Especial',
  'especial': 'Pizza Especial',
  'carbonara': 'Pizza Carbonara',
  'calabresa': 'Pizza Calabresa',
  '4 quesos': 'Pizza 4 Quesos',
  'four cheese': 'Pizza 4 Quesos',
  'ananá con jamón': 'Pizza Ananá con Jamón',
  'ananá': 'Pizza Ananá con Jamón',
  // Lomos
  'lomo completo': 'Lomo Completo',
  'lomo': 'Lomo Completo',
  'lomito': 'Lomo Completo',
  'sandwich de lomo': 'Lomo Completo',
  'lomo doble': 'Lomo Doble',
  'lomo super': 'Lomo Super',
  // Hamburguesas
  'burger': 'Hamburguesa Completa',
  'hamburguesa completa': 'Hamburguesa Completa',
  'hamburgesa completa': 'Hamburguesa Completa',
  'hamburguesa': 'Hamburguesa Completa',
  'hamburgesa': 'Hamburguesa Completa',
  // Empanadas (por sabor)
  'carne': 'Empanada Carne',
  'carne dulce': 'Empanada Carne Dulce',
  'pollo': 'Empanada Pollo',
  'roquefort emp': 'Empanada Roquefort',
  'roquefort empanada': 'Empanada Roquefort',
  'caprese': 'Empanada Caprese',
  'arabe': 'Empanada Arabe',
  'espinaca': 'Empanada Espinaca',
  'jamón y muzza': 'Empanada Jamón y Muzza',
  'palmito': 'Empanada Palmito',
  // Generales que pueden ser empanadas o pizzas según contexto
  'empanada': 'Empanada Carne',
  'empanadas': 'Empanada Carne',
};

export function canonicalName(name: string, context?: ProductCategory): string {
  const lower = name.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Si hay contexto, buscar primero en esa categoría
  if (context) {
    const candidates = Object.keys(DEFAULT_PRICES).filter(k => {
      if (context === 'pizza') return k.startsWith('Pizza ');
      if (context === 'empanada') return k.startsWith('Empanada ');
      if (context === 'lomo') return k.startsWith('Lomo ');
      if (context === 'burger') return k.startsWith('Hamburguesa ');
      return false;
    });
    const found = candidates.find(k => k.toLowerCase() === lower);
    if (found) return found;
  }

  if (SYNONYMS[lower]) return SYNONYMS[lower];
  const found = Object.keys(DEFAULT_PRICES).find(k => k.toLowerCase() === lower);
  return found || name;
}

export function getDefaultPrice(name: string): number {
  return DEFAULT_PRICES[canonicalName(name)] ?? 0;
}

let _pricesLoaded = false;

export function syncPrices(prices: Record<string, number>): void {
  let count = 0;
  for (const [name, price] of Object.entries(prices)) {
    if (DEFAULT_PRICES[name] === undefined || DEFAULT_PRICES[name] !== price) {
      DEFAULT_PRICES[name] = price;
      count++;
    }
  }
  if (count > 0) {
    console.log(`[cart] Synced ${count} prices from Insforge`);
    _pricesLoaded = true;
  }
}

export function arePricesLoaded(): boolean {
  return _pricesLoaded;
}

// Carritos en memoria: phone → Cart
const carts = new Map<string, Cart>();

export function getCart(phone: string): Cart {
  if (!carts.has(phone)) {
    carts.set(phone, { items: [], deliveryFee: 0, orderType: null });
  }
  return carts.get(phone)!;
}

export function clearCart(phone: string): void {
  carts.delete(phone);
}

export function addToCart(phone: string, name: string, qty: number, unitPrice?: number): void {
  const price = unitPrice ?? getDefaultPrice(name);
  const cart = getCart(phone);
  const cName = canonicalName(name);
  const existing = cart.items.find(i => i.name === cName);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.items.push({ name: cName, qty, unitPrice: price });
  }
  console.log(`[cart] ADD ${qty}x ${cName} @ $${price} → cart now: ${getCartSummary(phone)}`);
}

export function removeFromCart(phone: string, name: string, qty?: number): void {
  const cart = getCart(phone);
  const cName = canonicalName(name);
  if (qty === undefined) {
    cart.items = cart.items.filter(i => i.name !== cName);
    console.log(`[cart] REMOVE ALL ${cName} → cart now: ${getCartSummary(phone)}`);
  } else {
    const item = cart.items.find(i => i.name === cName);
    if (item) {
      item.qty -= qty;
      if (item.qty <= 0) cart.items = cart.items.filter(i => i.name !== cName);
      console.log(`[cart] REMOVE ${qty}x ${cName} → cart now: ${getCartSummary(phone)}`);
    }
  }
}

export function removeItemsContaining(phone: string, keyword: string): number {
  const cart = getCart(phone);
  const keywordLower = keyword.toLowerCase();
  const before = cart.items.length;
  cart.items = cart.items.filter(i => !i.name.toLowerCase().includes(keywordLower));
  const removed = before - cart.items.length;
  if (removed > 0) console.log(`[cart] REMOVE ALL containing "${keyword}" (${removed} items) → cart now: ${getCartSummary(phone)}`);
  return removed;
}

export function setOrderType(phone: string, type: 'retiro' | 'delivery'): void {
  const cart = getCart(phone);
  cart.orderType = type;
  cart.deliveryFee = type === 'delivery' ? DELIVERY_FEE : 0;
}

export function updateItemQty(phone: string, name: string, newQty: number): void {
  const cart = getCart(phone);
  const cName = canonicalName(name);
  const item = cart.items.find(i => i.name === cName);
  if (item) {
    if (newQty <= 0) {
      cart.items = cart.items.filter(i => i.name !== cName);
    } else {
      item.qty = newQty;
    }
    console.log(`[cart] UPDATE ${cName} qty → ${newQty} → cart now: ${getCartSummary(phone)}`);
  }
}

export function updateItemsByKeyword(phone: string, keyword: string, newQty: number): void {
  const cart = getCart(phone);
  const keywordLower = keyword.toLowerCase();
  const matches = cart.items.filter(i => i.name.toLowerCase().includes(keywordLower));
  for (const item of matches) {
    if (newQty <= 0) {
      cart.items = cart.items.filter(i => i.name !== item.name);
    } else {
      item.qty = newQty;
    }
  }
  if (matches.length > 0) console.log(`[cart] UPDATE all containing "${keyword}" qty → ${newQty} → cart now: ${getCartSummary(phone)}`);
}

export function calculateTotal(phone: string): number {
  const cart = getCart(phone);
  const itemsTotal = cart.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  return itemsTotal + cart.deliveryFee;
}

export function getCartSummary(phone: string): string {
  const cart = getCart(phone);
  if (cart.items.length === 0) return '(vacío)';
  const lines = cart.items.map(i => `${i.qty} ${i.name}=$${i.qty * i.unitPrice}`);
  if (cart.deliveryFee > 0) lines.push(`delivery=$${cart.deliveryFee}`);
  lines.push(`TOTAL=$${calculateTotal(phone)}`);
  return lines.join(' | ');
}

export function generateTotalReply(phone: string): string {
  const cart = getCart(phone);
  if (cart.items.length === 0) return '';

  const lines: string[] = [];
  const breakdown: string[] = [];

  for (const item of cart.items) {
    const subtotal = item.qty * item.unitPrice;
    if (item.qty > 1) {
      breakdown.push(`${item.qty} ${item.name} a $${item.unitPrice.toLocaleString('es-AR')} = $${subtotal.toLocaleString('es-AR')}`);
    } else {
      breakdown.push(`${item.name} ($${subtotal.toLocaleString('es-AR')})`);
    }
  }

  const total = calculateTotal(phone);
  lines.push(`El total es $${total.toLocaleString('es-AR')} (${breakdown.join(' + ')}).`);
  lines.push('Decime si es retiro en local o delivery.');

  return lines.join(' ');
}

export function generateReceiptReply(phone: string, name: string, paymentMethod: string): string {
  const cart = getCart(phone);
  if (cart.items.length === 0) return '';

  const lines: string[] = ['Pedido:'];
  for (const item of cart.items) {
    if (item.qty > 1) {
      const subtotal = item.qty * item.unitPrice;
      lines.push(`${item.qty} ${item.name} ($${item.unitPrice.toLocaleString('es-AR')} c/u = $${subtotal.toLocaleString('es-AR')})`);
    } else {
      lines.push(`${item.name} ($${item.unitPrice.toLocaleString('es-AR')})`);
    }
  }

  if (cart.deliveryFee > 0) {
    lines.push(`Delivery: $${cart.deliveryFee.toLocaleString('es-AR')}`);
  }

  const total = calculateTotal(phone);
  lines.push(`Total: $${total.toLocaleString('es-AR')}`);

  if (cart.orderType === 'retiro') {
    lines.push('Retiro: Av. San Martin 1245');
  }

  lines.push(`Nombre: ${name}`);

  if (paymentMethod === 'transferencia') {
    lines.push('Pago: Transferencia');
    lines.push('CBU: 0110594930059498273498 | Alias IMPASTO.PIZZA');
    lines.push('');
    lines.push('Te confirmamos pronto. Mandame el comprobante cuando hagas la transferencia.');
  } else {
    lines.push('Pago: Efectivo');
    lines.push('');
    lines.push('Te confirmamos pronto. Paga al recibir.');
  }

  return lines.join('\n');
}

// Parsea la respuesta del LLM y actualiza el carrito
export function parseCartFromLLMReply(phone: string, reply: string): void {
  const text = reply.toLowerCase();

  // "agrego 1 Pizza Fugazzeta" / "agrego una fugazzeta" / "agrego 6 Carne, 4 Pollo y 4 Roquefort"
  // "sumo 1 Pizza Fugazzeta" / "añado una fugazzeta"
  const addMatch = reply.match(/(?:agrego|sumo|añado)\s+(.+?)(?:\?|$)/i);
  if (addMatch) {
    const addText = addMatch[1];
    const itemParts = addText.split(/,\s*|\s+y\s+/);

    // Detect context: if items include empanada-specific words, treat all as empanadas
    const empanadaKeywords = ['carne', 'pollo', 'roquefort', 'caprese', 'arabe', 'espinaca', 'jamón', 'palmito', 'carne dulce'];
    const isEmpanadaContext = itemParts.some(p => {
      const w = p.replace(/^\d+\s+/, '').toLowerCase().trim();
      return empanadaKeywords.some(k => w.includes(k));
    });

    for (const part of itemParts) {
      const qtyMatch = part.match(/^(\d+)\s+(.+?)(?:\s*[,.$?]|\s*$)/i);
      const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
      const rawName = (qtyMatch ? qtyMatch[2].trim() : part.replace(/^\d+\s+/, '').split(/[.,;?!]/)[0].trim())
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (rawName.length < 2) continue;

      let cName = canonicalName(rawName);
      // If empanada context and ambiguous result, resolve to empanada variant
      if (isEmpanadaContext && cName.startsWith('Pizza ') && !rawName.toLowerCase().includes('pizza')) {
        // e.g., "roquefort" → try "Empanada Roquefort" instead
        const empVariant = 'Empanada ' + cName.replace('Pizza ', '');
        if (DEFAULT_PRICES[empVariant] !== undefined) cName = empVariant;
      }

      if (cName && DEFAULT_PRICES[cName] !== undefined) {
        addToCart(phone, cName, qty);
      } else {
        // En contexto empanada, buscar variante Empanada primero
        if (isEmpanadaContext) {
          const lastWord = rawName.toLowerCase().trim().split(/\s+/).pop() ?? '';
          const empKey = Object.keys(DEFAULT_PRICES).find(k =>
            k.startsWith('Empanada ') && k.toLowerCase().includes(lastWord)
          );
          if (empKey) { addToCart(phone, empKey, qty); continue; }
        }
        const fallback = Object.keys(DEFAULT_PRICES).find(k => {
          const kl = k.toLowerCase();
          const rl = rawName.toLowerCase();
          return kl.includes(rl) || rl.includes(kl.split(' ').pop() ?? '');
        });
        if (fallback) addToCart(phone, fallback, qty);
      }
    }
  }

// "saco las de Roquefort y la burger. Queda 8 Carne y 4 Pollo"
// "quito las de Roquefort y la burger. Queda 8 Carne y 4 Pollo"
// "retiro las de Roquefort..."  — PERO no "retiro en local" ni "retiro o delivery"
// NOTA: "retiro" solo como comando de sacar si va seguido de artículo (el/la/los/las/un/una/de)
// NOTA: "queda" se busca como palabra completa, no como substring de "quedan"
  const removeMatch = reply.match(/(?:saco|quito|retiro(?=\s+(?:el|la|los|las|un|una|de)\b))\s+/i);
  const removeStart = removeMatch?.index ?? -1;
  if (removeStart !== -1) {
    // Buscar "queda" como palabra completa (no "quedan")
    const quedaMatch = reply.match(/\bqueda\b/i);
    const quedaIdx = quedaMatch ? quedaMatch.index! : -1;
    const removeText = quedaIdx !== -1
      ? reply.substring(removeStart, quedaIdx)
      : reply.substring(removeStart);
    console.log(`[cart] removeText raw: "${removeText}"`);

    // Split by " y " (with spaces) to get multiple items
    const andParts = removeText.split(/\s+y\s+/);
    for (const partRaw of andParts) {
      // Strip leading articles and action verbs
      let part = partRaw.replace(/^(?:saco|sacame|quito|retiro|dejo|dejamos|dejame|las|de|la)\s+/gi, '').trim();
      part = part.split(/[.,]/)[0].trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (part.length < 2) continue;
      console.log(`[cart] remove part: "${part}"`);
      const cart = getCart(phone);

      // 1. Canonical exact match
      const cName = canonicalName(part);
      const exact = cart.items.find(i => i.name === cName);
      if (exact) { removeFromCart(phone, cName); continue; }

// 2. Partial match on cart items (check various matching strategies)
      const partial = cart.items.find(i => {
        const itemLower = i.name.toLowerCase();
        const partLower = part.toLowerCase();
        const itemWord = itemLower.split(' ').pop() ?? '';
        return itemLower.includes(partLower) ||
               partLower.includes(itemWord) ||
               partLower.includes(itemLower) ||
               i.name === canonicalName(part); // exact canonical match against item in cart
      });
      if (partial) { removeFromCart(phone, partial.name); continue; }

      // 3. Match on DEFAULT_PRICES keys
      const found = Object.keys(DEFAULT_PRICES).find(k => {
        const keyLower = k.toLowerCase();
        const partLower = part.toLowerCase();
        const keyWord = keyLower.split(' ').pop() ?? '';
        return keyLower.includes(partLower) || partLower.includes(keyWord) || partLower.includes(keyLower);
      });
      if (found) { removeItemsContaining(phone, part); }
    }
  }

  // "cambiame las de carne a 8" / "cambio las de carne a 8" → update qty
  const changeMatch = reply.match(/cambi(?:ame|o)\s+(?:las?\s+)?(?:de\s+)?(\w+)\s+a\s+(\d+)/i);
  if (changeMatch) {
    const rawName = changeMatch[1];
    const newQty = parseInt(changeMatch[2]);
    const cName = canonicalName(rawName);
    if (cName && DEFAULT_PRICES[cName] !== undefined) {
      updateItemQty(phone, cName, newQty);
    } else {
      updateItemsByKeyword(phone, rawName, newQty);
    }
  }

  // "queda 8 Carne y 4 Pollo" → parse the qty+name pairs AFTER "queda"
  // This is independent of the remove section above
  const quedaMatch2 = reply.match(/\bqueda\b/i);
  const quedaIdx2 = quedaMatch2?.index ?? -1;
  if (quedaIdx2 !== -1) {
    const afterQueda = reply.substring(quedaIdx2 + 5); // skip "queda"
    // Extract "8 Carne y 4 Pollo" — stop at first period or end
    const quedaTextMatch = afterQueda.match(/^(.+?)(?:\.|$)/i);
    if (quedaTextMatch) {
      const quedaText = quedaTextMatch[1];
      console.log(`[cart] queda text: "${quedaText}"`);
      const qtyPattern = /(\d+)\s+(.+?)(?:\s+y\s+|,|\.|$)/gi;
      let q;
      while ((q = qtyPattern.exec(quedaText)) !== null) {
        const qty = parseInt(q[1]);
        const rawName = q[2].trim();
        const cName = canonicalName(rawName);
        console.log(`[cart] queda parsed: qty=${qty}, raw="${rawName}", canonical="${cName}"`);
        if (cName && DEFAULT_PRICES[cName] !== undefined) {
          updateItemQty(phone, cName, qty);
        } else {
          // Try partial match for ambiguous cases like "Carne" → Empanada Carne
          const matched = Object.keys(DEFAULT_PRICES).find(k => k.toLowerCase().includes(rawName) || rawName.includes(k.toLowerCase().split(' ').pop() ?? ''));
          if (matched) updateItemQty(phone, matched, qty);
        }
      }
    }
  }
}