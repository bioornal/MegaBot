import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../lib/db';
import { getAIReply } from '../lib/openai';
import { buildSystemPrompt } from '../lib/system-prompt';
import { getCatalogContext } from '../lib/catalog';
import { getCompanyInfoContext } from '../lib/company-info';
import { getMenuContextFromInsforge, getCompanyInfoFromInsforge, savePedidoToInsforge, getPricesMap } from '../lib/insforge-client';
import { randomDelayMs, sleep, humanDelayMs } from '../lib/delay';
import { getCart, clearCart, calculateTotal, addToCart, removeFromCart, updateItemQty, parseCartFromLLMReply, applyUserCartCorrections, canonicalName, setOrderType, generateTotalReply, syncPrices, arePricesLoaded, type Cart } from '../lib/cart';
import type { WhatsAppProvider, IncomingMessage } from '../providers/types';
import { getTenantById } from '../tenants.config';
import { detectIntent } from '../lib/intent-iguazufalls';
import { findCabanasByCapacity, fetchCabanas, getCabanaByName } from '../lib/catalog';
import { checkAvailability, createReservationEvent, updateReservationEvent } from '../lib/calendar-gcal';
import { getSeason } from '../lib/season';
import { parseState, serializeState, type ReservationState } from '../lib/reservation-state';
import { verifyPaymentReceipt } from '../lib/verify-payment';
import { getIguazuWikiContext } from '../lib/iguazu-context';
import { getWeatherContext } from '../lib/weather';

const AI_REPLY_DELAY_MIN_MS = 3_000;
const AI_REPLY_DELAY_MAX_MS = 25_000;
const AI_REPLY_DELAY_ENABLED = process.env.AI_REPLY_DELAY !== 'false';

// ── Anti-ban: variación de patrones humanos ─────────────────────────
const PRE_READ_DELAY_MS = [500, 3_000];     // delay antes de marcar como leído
const TYPING_BURST_CHANCE = 0.2;            // 20% chance de ráfaga de "reescritura"
const SKIP_TYPING_CHANCE = 0.15;            // 15% chance de no mandar typing (respuesta corta)
const KEEP_TYPING_CHANCE = 0.3;             // 30% mantener composing unos segundos extra

function loadTenantOrThrow() {
  const id = process.env.TENANT_ID;
  if (!id) {
    throw new Error('[handler] TENANT_ID env var es obligatorio (revisar PM2 + .env.{tenant})');
  }
  const t = getTenantById(id);
  if (!t) {
    throw new Error(`[handler] TENANT_ID="${id}" no existe en tenants.config.ts`);
  }
  return t;
}
const _tenant = loadTenantOrThrow();
const SYSTEM_PROMPT = buildSystemPrompt(_tenant.botName, _tenant.name);
const db = getDb(_tenant.dataDir);
const {
  getOrCreateConversation,
  getConversationById,
  getConversationByPhone,
  insertMessage,
  getRecentHistory,
  setMode,
  clearMessages,
} = db;
console.log(`[handler] Tenant: ${_tenant.id} | DB: ${_tenant.dataDir}`);

const IS_IGUAZU = _tenant.id === 'iguazufalls';

// --- Bypass de verificación de comprobante (solo IguazuFalls) ---
// Persiste en disco para sobrevivir reinicios del worker.
// Toggle: #bypass on / #bypass off desde auto-mensaje de WhatsApp.
const BYPASS_FLAG_FILE = IS_IGUAZU
  ? path.join(path.resolve(_tenant.dataDir), 'bypass_receipt.flag')
  : '';

function isBypassActive(): boolean {
  if (!IS_IGUAZU) return false;
  return fs.existsSync(BYPASS_FLAG_FILE);
}

function setBypass(active: boolean): void {
  if (active) {
    fs.writeFileSync(BYPASS_FLAG_FILE, '1');
  } else {
    try { fs.unlinkSync(BYPASS_FLAG_FILE); } catch { /* ya no existe */ }
  }
}

if (IS_IGUAZU) {
  console.log(`[handler] Bypass comprobante: ${isBypassActive() ? 'ACTIVO' : 'inactivo'}`);
}

// --- Bot pausado — flag global para desactivar el bot de un tenant ---
const BOT_PAUSED_FILE = path.join(path.resolve(_tenant.dataDir), 'bot_paused.flag');

function isBotPaused(): boolean {
  return fs.existsSync(BOT_PAUSED_FILE);
}

function setBotPaused(paused: boolean): void {
  if (paused) {
    fs.writeFileSync(BOT_PAUSED_FILE, '1');
  } else {
    try { fs.unlinkSync(BOT_PAUSED_FILE); } catch { /* ya no existe */ }
  }
}

console.log(`[handler] Bot: ${isBotPaused() ? 'PAUSADO' : 'ACTIVO'}`);

async function buildIguazufallsExtras(
  msg: IncomingMessage,
  conversationId: number
): Promise<string> {
  // Cargar estado de reserva del SQLite (vacío si nunca se inició una reserva).
  const stateJson = db.getReservationState(conversationId);
  const state: ReservationState | null = parseState(stateJson);
  const intent = detectIntent(msg.text ?? '', !!msg.mediaUrl);
  const blocks: string[] = [];

// Si el turno anterior hubo un error de disponibilidad (fechas pasadas, etc.),
  // inyectamos la instrucción para Paula en este turno
  if (state && (state as any).step === 'disp_error' && (state as any).error) {
    console.log(`[handler] Inyectando error previo de DISPONIBILIDAD: ${(state as any).error.substring(0, 60)}...`);
    blocks.push((state as any).error);
    db.setReservationState(conversationId, '');
  }

  // Si el turno anterior generó DISPONIBILIDAD (disp_ready), inyectarla ahora
  // para que Paula muestre las cabañas al cliente
  if (state && (state as any).step === 'disp_ready' && (state as any).data) {
    console.log(`[handler] Inyectando DISPONIBILIDAD lista para mostrar`);
    blocks.push((state as any).data);
    db.setReservationState(conversationId, '');
  }

  // Si la reserva ya está completada (comprobante verificado, evento CONFIRMADO),
  // recordarle a Paula que está todo listo para que responda con seguridad
  if (state && (state as any).step === 'completed') {
    console.log(`[handler] Reserva ya completada — inyectando CONFIRMADO`);
    blocks.push(
      'RESERVA CONFIRMADA: El comprobante ya fue verificado y la reserva está CONFIRMADA en el calendario. ' +
      'Si el cliente pregunta si está confirmado, respondé que SÍ, está todo listo. ' +
      'NO digas "en breve", "el equipo va a confirmar" ni frases similares — YA ESTÁ CONFIRMADO.'
    );
    db.setReservationState(conversationId, '');
  }

  // === Caso BYPASS sin estado de reserva (modo test) ===
  // Si bypass está ON y llega una imagen, aceptar como OK aunque no haya
  // habido un #reservar previo. Permite testear el flujo de comprobante
  // sin tener que armar toda la reserva primero.
  if (isBypassActive() && intent.intent === 'receipt' && msg.mediaUrl && state?.step !== 'awaiting_receipt') {
    console.log('[handler] Bypass activo + sin awaiting_receipt → comprobante aceptado (test)');
    blocks.push(
      'COMPROBANTE: OK\n' +
      'Detalle: bypass activo — verificación omitida (modo test).\n' +
      'LA RESERVA YA ESTÁ CONFIRMADA. ' +
      'Respondé EXACTAMENTE: "Comprobante recibido y verificado. ¡Reserva confirmada! Cualquier consulta estamos a disposición." ' +
      'NO digas "en breve" ni "el equipo confirma" — ya está confirmado.'
    );
    return blocks.join('\n\n');
  }

  // === Caso COMPROBANTE ===
  if (intent.intent === 'receipt' && state?.step === 'awaiting_receipt' && msg.mediaUrl && state.sena) {
    let receiptOk = false;
    let tag = 'UNREADABLE';
    let detail = 'error técnico al analizar';

    if (isBypassActive()) {
      // Modo test: aceptar cualquier imagen sin verificar
      receiptOk = true;
      tag = 'OK';
      detail = 'bypass activo — verificación omitida (modo test)';
      console.log('[handler] Bypass activo → comprobante aceptado sin verificar');
    } else {
      try {
        const result = await verifyPaymentReceipt({
          imageUrl: msg.mediaUrl,
          expectedAmount: state.sena,
          bankAlias: process.env.BANK_ALIAS ?? 'iguazufalls.test',
          bankCBU: process.env.BANK_CBU ?? '',
          bankTitular: process.env.BANK_TITULAR ?? 'IguazuFalls',
        });
        receiptOk = result.ok;
        tag = result.ok
          ? 'OK'
          : result.issue === 'wrong_account' ? 'WRONG_ACCOUNT'
          : result.issue === 'amount_mismatch' ? 'AMOUNT_MISMATCH'
          : 'UNREADABLE';
        detail = 'detail' in result ? result.detail : 'verificado';
      } catch {
        tag = 'UNREADABLE';
        detail = 'error técnico al analizar';
      }
    }

    if (receiptOk && state.calendar_id && state.event_id) {
      try {
        await updateReservationEvent(
          state.calendar_id,
          state.event_id,
          'confirmed',
          state.huesped_nombre ?? 'Huésped',
          state.personas ?? 1,
        );
        const completed: ReservationState = { ...state, step: 'completed' };
        db.setReservationState(conversationId, serializeState(completed));
        console.log(`[handler] Evento Calendar confirmado: ${state.event_id}`);
      } catch (e) {
        console.error('[handler] Error confirmando evento en Calendar:', e);
      }
    }

    blocks.push(`COMPROBANTE: ${tag}\nDetalle: ${detail}\nLA RESERVA YA ESTÁ CONFIRMADA. El evento en el calendario pasó de PENDIENTE a CONFIRMADO. Decile al cliente EXACTAMENTE: "Comprobante recibido y verificado. ¡Reserva confirmada! Cualquier consulta estamos a disposición." NO digas "en breve" ni "el equipo va a confirmar" — ya está confirmado.`);
    return blocks.join('\n\n');
  }

  return blocks.join('\n\n');
}

async function generateDisponibilidad(
  personas: number,
  checkIn: string,
  checkOut: string
): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ciDate = new Date(checkIn + 'T12:00:00-03:00');
  if (ciDate < today) {
    return `DISPONIBILIDAD — INSTRUCCIÓN: las fechas (${checkIn} → ${checkOut}) ya pasaron. Decile al cliente en su idioma y pedile fechas futuras. NO listes cabañas.`;
  }

  const candidatas = await findCabanasByCapacity(personas, _tenant.productsTable);
  if (candidatas.length === 0) {
    return `DISPONIBILIDAD: ninguna cabaña admite ${personas} personas (máximo por unidad: 6). Derivá al asesor.`;
  }

  const lines = [
    `DISPONIBILIDAD — INSTRUCCIÓN: copiá la siguiente lista TAL CUAL en tu respuesta al cliente, en su idioma. NO digas "voy a verificar" ni "un momento" — la información ya está acá. Si una cabaña tiene "❌ ocupado" NO la ofrezcas; ofrecé solo las que tienen "✅".`,
    ``,
    `Opciones para ${personas} personas (${checkIn} → ${checkOut}):`,
  ];
  for (const c of candidatas) {
    const season = getSeason(new Date(checkIn + 'T12:00:00-03:00'));
    const p = season === 'alta' ? c.precio_alta : season === 'media' ? c.precio_media : c.precio_baja;
    const precio = ` — $${p.toLocaleString('es-AR')}/noche (${season})`;
    let libre = '';
    try {
      const free = await checkAvailability(c.calendar_id, checkIn, checkOut);
      libre = free ? ' ✅' : ' ❌ ocupado';
    } catch (e: any) {
      console.error(`[handler] checkAvailability error para ${c.nombre}: ${e.message}`);
    }
    lines.push(`- ${c.nombre} (${c.capacidad_max}p, ${c.metros2}m²)${precio}${libre}`);
  }
  return lines.join('\n');
}

export async function confirmReservationFromState(
  conversationId: number,
  partial: Required<Pick<ReservationState, 'cabana' | 'check_in' | 'check_out' | 'personas' | 'huesped_nombre' | 'huesped_telefono' | 'total' | 'sena'>>
): Promise<{ event_id: string }> {
  const cabanas = await fetchCabanas(_tenant.productsTable);
  const cabana = getCabanaByName(cabanas, partial.cabana);
  if (!cabana) throw new Error(`Cabaña no encontrada: ${partial.cabana}`);

  const eventId = await createReservationEvent({
    calendarId: cabana.calendar_id,
    cabana: cabana.nombre,
    huespedNombre: partial.huesped_nombre,
    huespedTelefono: partial.huesped_telefono,
    personas: partial.personas,
    checkIn: partial.check_in,
    checkOut: partial.check_out,
    total: partial.total,
    sena: partial.sena,
  });

  const newState: ReservationState = {
    step: 'awaiting_receipt',
    ...partial,
    cabana: cabana.nombre,
    calendar_id: cabana.calendar_id,
    event_id: eventId,
  };
  db.setReservationState(conversationId, serializeState(newState));
  return { event_id: eventId };
}

const ADMIN_HELP =
  'Comandos disponibles:\n' +
  '#ia NUMERO — activar modo IA\n' +
  '#humano NUMERO — activar modo humano\n' +
  '#reset NUMERO — borrar memoria\n' +
  '#bot on — reactivar bot (todas las conversaciones)\n' +
  '#bot off — pausar bot (todas las conversaciones)\n' +
  (IS_IGUAZU
    ? '#reservar TEL "CABAÑA" CHECKIN CHECKOUT PERS TOTAL SEÑA "NOMBRE" — crear reserva manual\n' +
      '#bypass on — omitir verificación de comprobante (modo test)\n' +
      '#bypass off — reactivar verificación real de comprobante\n'
    : '') +
  '\nEjemplo: #humano 5491112345678';

async function handleAdminCommand(
  msg: IncomingMessage,
  provider: WhatsAppProvider
): Promise<void> {
  const parts = msg.text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === '#bypass' && IS_IGUAZU) {
    const mode = (parts[1] ?? '').toLowerCase();
    if (mode === 'on') {
      setBypass(true);
      await provider.sendMessage(msg.from, '🟡 Bypass ON — cualquier imagen se acepta como comprobante válido. Usá solo para pruebas.');
    } else if (mode === 'off') {
      setBypass(false);
      await provider.sendMessage(msg.from, '🟢 Bypass OFF — verificación real de comprobante activada.');
    } else {
      const estado = isBypassActive() ? '🟡 ACTIVO (modo test)' : '🟢 inactivo (producción)';
      await provider.sendMessage(msg.from, `Bypass comprobante: ${estado}\nUso: #bypass on | #bypass off`);
    }
    return;
  }

  if (cmd === '#reservar' && IS_IGUAZU) {
    // Sintaxis: #reservar <tel> "<cabana>" <YYYY-MM-DD> <YYYY-MM-DD> <pers> <total> <sena> "<nombre>"
    const tokens = msg.text.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
    if (tokens.length < 9) {
      await provider.sendMessage(msg.from, 'Uso: #reservar <tel> "<cabana>" <ci> <co> <pers> <total> <sena> "<nombre>"');
      return;
    }
    const unq = (s: string) => s.replace(/^"|"$/g, '');
    const [, tel, cab, ci, co, pers, total, sena, nom] = tokens.map(unq);
    try {
      const phoneDigits = tel.replace(/\D/g, '');
      const targetConvo = getConversationByPhone(phoneDigits);
      if (!targetConvo) {
        await provider.sendMessage(msg.from, `No encontré conversación con ${tel}.`);
        return;
      }
      const r = await confirmReservationFromState(targetConvo.id, {
        cabana: cab,
        check_in: ci,
        check_out: co,
        personas: parseInt(pers, 10),
        total: parseInt(total, 10),
        sena: parseInt(sena, 10),
        huesped_nombre: nom,
        huesped_telefono: '+' + phoneDigits,
      });
      await provider.sendMessage(msg.from, `✓ Reserva creada en Calendar (${r.event_id}). Estado: awaiting_receipt.`);
    } catch (e: any) {
      await provider.sendMessage(msg.from, `✗ Error: ${e.message}`);
    }
    return;
  }

  const digits = (parts[1] ?? '').replace(/\D/g, '');

  if (cmd === '#bot') {
    const sub = (parts[1] ?? '').toLowerCase();
    if (sub === 'off') {
      setBotPaused(true);
      await provider.sendMessage(msg.from, '🔴 Bot PAUSADO — todas las conversaciones quedan en modo manual. Usá #bot on para reactivar.');
    } else if (sub === 'on') {
      setBotPaused(false);
      await provider.sendMessage(msg.from, '🟢 Bot ACTIVO — respondiendo normalmente.');
    } else {
      const estado = isBotPaused() ? '🔴 PAUSADO' : '🟢 ACTIVO';
      await provider.sendMessage(msg.from, `Estado del bot: ${estado}\nUso: #bot on | #bot off`);
    }
    return;
  }

  if (!digits) {
    await provider.sendMessage(msg.from, ADMIN_HELP);
    return;
  }

  const convo = getConversationByPhone(digits);
  if (!convo) {
    await provider.sendMessage(msg.from, `No encontré conversación con ${parts[1]}.`);
    return;
  }

  const label = convo.name ?? digits;

  if (cmd === '#ia') {
    setMode(convo.id, 'AI');
    await provider.sendMessage(msg.from, `✓ ${label} → modo IA activado.`);
  } else if (cmd === '#humano') {
    setMode(convo.id, 'HUMAN');
    await provider.sendMessage(msg.from, `✓ ${label} → modo humano activado.`);
  } else if (cmd === '#reset') {
    clearMessages(convo.id);
    clearCart(msg.from); // también limpiar carrito
    await provider.sendMessage(msg.from, `✓ Memoria de ${label} borrada.`);
  } else {
    await provider.sendMessage(msg.from, ADMIN_HELP);
  }
}

export async function handleIncoming(
  msg: IncomingMessage,
  provider: WhatsAppProvider
): Promise<void> {
  // Mensaje del operador enviado a sí mismo → comandos de control
  if (msg.fromMe && msg.isSelfChat) {
    if (msg.text.startsWith('#')) {
      await handleAdminCommand(msg, provider);
    }
    return;
  }

  // Operador respondió a un cliente desde dispositivo vinculado → guardar en dashboard
  if (msg.fromMe) {
    const convo = getOrCreateConversation(msg.from);
    insertMessage(convo.id, 'human', msg.text);
    // NO cambiar el modo - mantener el que ya tenía (AI o HUMAN)
    console.log(`[handler] <- Operador (dispositivo) → ${msg.from}: "${msg.text}"`);
    return;
  }

  // Mensaje entrante normal de un cliente
  console.log(
    `[handler] <- ${msg.provider} | de ${msg.from} (${msg.senderName ?? 'sin nombre'}): "${msg.text}"`
  );

  const convo = getOrCreateConversation(msg.from, msg.senderName);
  insertMessage(convo.id, 'user', msg.text, msg.mediaUrl);

  const fresh = getConversationById(convo.id);
  if (!fresh || fresh.mode !== 'AI') {
    console.log(`[handler] Conversacion ${convo.id} en modo HUMAN - sin auto-respuesta`);
    return;
  }

  if (isBotPaused()) {
    console.log(`[handler] Bot PAUSADO — mensaje de ${msg.from} guardado sin auto-respuesta`);
    return;
  }

  const history = getRecentHistory(convo.id, 20);
  const llmMessages = history.map((m) => {
    let content: any = m.content;
    if (m.media_url) {
      content = [
        { type: 'text', text: m.content || 'Imagen adjunta' },
        { type: 'image_url', image_url: { url: m.media_url } }
      ];
    }
    return {
      role: (m.role === 'human' ? 'assistant' : m.role) as 'user' | 'assistant',
      content,
    };
  });

  console.log(`[handler] Llamando LLM con ${llmMessages.length} mensajes...`);
  const start = Date.now();

  // ── Anti-ban: simular pausa de lectura antes de reaccionar ──────
  const preReadMs = randomDelayMs(PRE_READ_DELAY_MS[0], PRE_READ_DELAY_MS[1]);
  await sleep(preReadMs);
  await provider.markAsRead(msg);

  // ── Anti-ban: no siempre mandar typing (15% mensajes cortos sin él) ──
  const skipTyping = msg.text.length < 40 && Math.random() < SKIP_TYPING_CHANCE;
  if (!skipTyping) {
    await provider.sendTyping(msg.from);
  }

  console.log(`[handler] Obteniendo companyInfoContext (tabla: ${_tenant.companyInfoTable})...`);
  const companyInfoContext = _tenant.dataSource === 'insforge'
    ? await getCompanyInfoFromInsforge()
    : await getCompanyInfoContext(_tenant.companyInfoTable);
  console.log(`[handler] companyInfoContext length: ${companyInfoContext.length}`);

  console.log(`[handler] Obteniendo catalogContext (tabla: ${_tenant.productsTable}) para: "${msg.text}"`);
  // IguazuFalls: NO inyectar catálogo — las cabañas vienen del bloque DISPONIBILIDAD
  const catalogContext = IS_IGUAZU
    ? ''
    : _tenant.dataSource === 'insforge'
      ? await getMenuContextFromInsforge(msg.text)
      : await getCatalogContext(msg.text, _tenant.productsTable);
  console.log(`[handler] catalogContext length: ${catalogContext.length}`);

  // Sync prices from Insforge into cart module (solo para Impasto)
  if (_tenant.dataSource === 'insforge' && !arePricesLoaded()) {
    const prices = await getPricesMap();
    if (Object.keys(prices).length > 0) syncPrices(prices);
  }

  // Cart context: solo Impasto
  let cartContext = '';
  if (_tenant.dataSource === 'insforge') {
    const cartForContext = getCart(msg.from);
    if (cartForContext.items.length > 0) {
      const cartLines = cartForContext.items.map(i => `- ${i.qty}x ${i.name} ($${i.unitPrice}/u)`);
      if (cartForContext.deliveryFee > 0) cartLines.push(`- Delivery $${cartForContext.deliveryFee}`);
      const cartTotal = calculateTotal(msg.from);
      cartContext = `\n\n[CARRITO ACTUAL]\n${cartLines.join('\n')}\nTotal: $${cartTotal}`;
      console.log(`[handler] Cart context: ${cartContext}`);
    }
  }

  // Extras: solo IguazuFalls (DISPONIBILIDAD / COMPROBANTE / CLIMA / WIKI)
  let extras = '';
  if (IS_IGUAZU) {
    extras = await buildIguazufallsExtras(msg, convo.id);
    console.log(`[handler] iguazufalls extras length: ${extras.length}`);
  }

  // IguazuFalls: fecha actual (SIEMPRE, para que Paula sepa el año/mes/día) + wiki + clima
  let iguazuExtraContext = '';
  if (IS_IGUAZU) {
    const now = new Date();
    const hoy = now.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
    iguazuExtraContext += `\n\nFECHA ACTUAL: Hoy es ${hoy} (huso horario Argentina, GMT-3). Usá este dato para interpretar fechas relativas como "el mes que viene", "la semana que viene", etc. El año actual es ${now.getFullYear()}.`;
    const wikiCtx = await getIguazuWikiContext();
    if (wikiCtx) iguazuExtraContext += '\n\n' + wikiCtx;

    const weatherKeywords = /\b(clim|clie|tiemp|temp|llov|lluev|lluv|rain|weather|forecast|sol|calor|cald|calur|cool|chuva|chov|chuvis|tempo|quente|fr[ií]o|fresc|umid|moist|humid|storm|torment|vien|vent|wind|pron[oó]st|previs|neblin|niebla|nublad|frost|helad|graniz)/i;
    if (weatherKeywords.test(msg.text)) {
      const detectedLang = /^(?!.*[\u00e0-\u00ff]).*[a-zA-Z]/.test(msg.text) && !/[\u00f1\u00e1\u00e9\u00ed\u00f3\u00fa]/.test(msg.text)
        ? 'en'
        : /(?:obrigad|t[eê]m|qual|como|chov|quis|quero|pod|podem|gost|querem|previs|hoje)/i.test(msg.text)
          ? 'pt'
          : 'es';
      const weatherCtx = await getWeatherContext(detectedLang);
      if (weatherCtx) iguazuExtraContext += '\n\n' + weatherCtx;
      console.log(`[handler] Weather context injected for Paula (lang=${detectedLang})`);
    }
  }

  // Si el sistema ya verificó el comprobante (bloque COMPROBANTE: presente),
  // no pasamos la imagen al LLM — la decisión ya está tomada en texto.
  // Esto también evita que un URL de imagen roto/expirado crashee el handler.
  if (extras.includes('COMPROBANTE:')) {
    for (const m of llmMessages) {
      if (typeof m.content !== 'string' && Array.isArray(m.content)) {
        m.content = '[comprobante recibido]';
      }
    }
  }

  const fullSystemPrompt = [SYSTEM_PROMPT, companyInfoContext, catalogContext, extras]
    .filter(Boolean)
    .join('\n\n') + cartContext + iguazuExtraContext;

  console.log(`[handler] fullSystemPrompt length: ${fullSystemPrompt.length}`);
  console.log(`[handler] llmMessages:`, llmMessages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.substring(0, 50) : '[multi]' })));

  const reply = await getAIReply(llmMessages, fullSystemPrompt, _tenant.model);
  console.log(`[handler] LLM respondio en ${Date.now() - start}ms, reply length: ${reply.length}`);
  console.log(`[handler] LLM reply: "${reply.substring(0, 200)}..."`);

  let finalReply = reply;

  // === IguazuFalls: LLM extrae datos estructurados → consultamos Calendar ===
  if (IS_IGUAZU) {
    const extractMatch = finalReply.match(/\[EXTRAC_DATOS:\s*([^\]]+)\]/);
    if (extractMatch) {
      const raw = extractMatch[1];
      const getParam = (key: string) => {
        const m = raw.match(new RegExp(`${key}\\s*=\\s*([^\\s]+)`, 'i'));
        return m ? m[1].trim() : null;
      };
      const pRaw = getParam('personas');
      const ci = getParam('ci');
      const co = getParam('co');
      const personas = pRaw && pRaw !== '?' ? parseInt(pRaw, 10) : null;

      if (personas && ci && co && ci !== '?' && co !== '?' &&
          Number.isFinite(personas) && personas >= 1 &&
          /^\d{4}-\d{2}-\d{2}$/.test(ci) && /^\d{4}-\d{2}-\d{2}$/.test(co)) {
        console.log(`[handler] EXTRAC_DATOS: ${personas}p ${ci}→${co} — consultando disponibilidad...`);
        const dispBlock = await generateDisponibilidad(personas, ci, co);

        // Si es un error real (fechas pasadas, sin cabañas) → NO mostrar al cliente
        // "INSTRUCCIÓN" aparece también en el bloque normal, así que chequeamos frases de error
if (dispBlock.includes('ya pasaron') || dispBlock.includes('ninguna cabaña admite')) {
          console.log(`[handler] DISPONIBILIDAD bloqueada (error): ${dispBlock.substring(0, 80)}...`);
          db.setReservationState(convo.id, serializeState({ step: 'disp_error', error: dispBlock } as any));
          finalReply = finalReply.replace(extractMatch[0], '');
        } else {
          // Es una lista real de cabañas → guardarla para el PRÓXIMO turno, NO inyectarla ahora
          // (Paula ya respondió confirmando fechas, el usuario debe confirmar primero)
          console.log(`[handler] DISPONIBILIDAD generada — guardando para próximo turno`);
          db.setReservationState(convo.id, serializeState({ step: 'disp_ready', data: dispBlock } as any));
          finalReply = finalReply.replace(extractMatch[0], '');
        }
      } else {
        // Datos incompletos → solo quitamos el marker
        console.log(`[handler] EXTRAC_DATOS incompleto (p=${pRaw} ci=${ci} co=${co}) — eliminando marker`);
        finalReply = finalReply.replace(extractMatch[0], '');
      }
    }
  }

  // === Lógica de carrito: SOLO para Impasto (dataSource: insforge) ===
  if (_tenant.dataSource === 'insforge') {
    // Actualizar carrito basado en lo que el LLM confirmó
    applyUserCartCorrections(msg.from, msg.text);
    parseCartFromLLMReply(msg.from, reply);

    // Detectar delivery/retiro ANTES de cualquier corrección de total
    // El fee debe estar en el cart antes de comparar con el total del LLM
    const lowerMsg = msg.text.toLowerCase();
    const isDelivery = lowerMsg.includes('delivery') ||
                       lowerMsg.includes('envío a ') ||
                       lowerMsg.includes('enviame a ') ||
                       lowerMsg.includes('mandame a ') ||
                       (lowerMsg.match(/^(?:es por|a|mandame|env[ií]o)\s+a\s+\w/) !== null);
    const isRetiro = !isDelivery && (lowerMsg.includes('retiro') || lowerMsg.includes('en local'));

    const normalizedMsg = lowerMsg.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const mentionsDeliveryAsComplaint =
      /\b(?:bonific|bonifiquen|descuent|gratis|reclam|quej)/i.test(normalizedMsg) &&
      normalizedMsg.includes('delivery');

    if (isDelivery && !mentionsDeliveryAsComplaint) {
      setOrderType(msg.from, 'delivery');
      console.log(`[handler] Delivery detectado → fee $5000 agregado`);
    } else if (isRetiro || normalizedMsg.includes('retirar') || normalizedMsg.includes('paso a retirar')) {
      setOrderType(msg.from, 'retiro');
      console.log(`[handler] Retiro detectado → fee $0`);
    }

    // SIEMPRE corregir el total del LLM con el del carrito (math exacta)
    const cartTotal = calculateTotal(msg.from);
    const totalMatch = reply.match(/total[:\s]*\$?([0-9.,]+)/i);
    if (totalMatch) {
      const llmTotal = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
      if (Math.abs(cartTotal - llmTotal) > 0) {
        console.log(`[handler] Cart total $${cartTotal} vs LLM total ${totalMatch[1]} → replacing`);
        finalReply = finalReply.replace(/total[:\s]*\$?([0-9.,]+)/gi, 'Total: $$' + cartTotal.toLocaleString('es-AR'));
      }
    }
  }

  // === IguazuFalls: marker [CREAR_RESERVA: ...] del LLM ===
  // Cuando Paula tiene todos los datos y el cliente confirma, emite este marker.
  // El handler lo parsea, crea el evento PENDIENTE en Calendar y deja la conversación
  // en estado awaiting_receipt. El marker se borra de la respuesta antes de enviarla.
  if (IS_IGUAZU) {
    const markerMatch = finalReply.match(/\[CREAR_RESERVA:\s*([^\]]+)\]/);
    if (markerMatch) {
      // Si ya hay un evento creado para esta conversación, ignorar el marker —
      // probablemente el LLM lo re-emitió en un turno posterior por confusión.
      const existingState = parseState(db.getReservationState(convo.id));
      if (existingState?.event_id) {
        console.log(`[handler] Marker ignorado: ya existe evento ${existingState.event_id} (step=${existingState.step})`);
        finalReply = finalReply.replace(markerMatch[0], '').trim();
        // continúa con resto del handler
      } else {
      const params = markerMatch[1];
      const get = (key: string) => {
        const re = new RegExp(`${key}\\s*=\\s*"([^"]+)"|${key}\\s*=\\s*([^\\s]+)`, 'i');
        const m = params.match(re);
        return m ? (m[1] ?? m[2]).trim() : null;
      };
      const cabanaName = get('cabana');
      const ci = get('ci') || get('checkin');
      const co = get('co') || get('checkout');
      const personasStr = get('personas');
      const nombre = get('nombre');
      const telefono = get('telefono') || msg.from.split('@')[0];

      try {
        if (!cabanaName || !ci || !co || !personasStr || !nombre) {
          throw new Error(`Marker incompleto: cabana=${cabanaName} ci=${ci} co=${co} personas=${personasStr} nombre=${nombre}`);
        }
        const personas = parseInt(personasStr, 10);
        if (!Number.isFinite(personas) || personas < 1) throw new Error(`personas inválido: ${personasStr}`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ci) || !/^\d{4}-\d{2}-\d{2}$/.test(co)) {
          throw new Error(`fechas deben ser YYYY-MM-DD: ci=${ci} co=${co}`);
        }
        // Rechazar fechas pasadas
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (new Date(ci + 'T12:00:00-03:00') < today) {
          throw new Error(`fecha de check-in en el pasado: ${ci}`);
        }

        const cabanas = await fetchCabanas(_tenant.productsTable);
        const cabana = getCabanaByName(cabanas, cabanaName);
        if (!cabana) throw new Error(`Cabaña no encontrada: ${cabanaName}`);
        if (personas > cabana.capacidad_max) throw new Error(`${cabana.nombre} admite hasta ${cabana.capacidad_max} personas`);

        const free = await checkAvailability(cabana.calendar_id, ci, co);
        if (!free) throw new Error(`${cabana.nombre} ocupado entre ${ci} y ${co}`);

        const season = getSeason(new Date(ci + 'T12:00:00-03:00'));
        const precioNoche = season === 'alta' ? cabana.precio_alta : season === 'media' ? cabana.precio_media : cabana.precio_baja;
        const noches = Math.round((new Date(co + 'T12:00:00-03:00').getTime() - new Date(ci + 'T12:00:00-03:00').getTime()) / (24 * 60 * 60 * 1000));
        if (noches < 1) throw new Error(`Rango inválido: ${ci} → ${co}`);
        const total = precioNoche * noches;
        const sena = Math.round(total * 0.5);

        const r = await confirmReservationFromState(convo.id, {
          cabana: cabana.nombre,
          check_in: ci,
          check_out: co,
          personas,
          huesped_nombre: nombre,
          huesped_telefono: telefono,
          total,
          sena,
        });
        console.log(`[handler] ✅ Reserva auto-creada: ${cabana.nombre} ${ci}→${co} ${personas}p — eventId=${r.event_id}`);

        // Reemplazar el marker con confirmación natural en la respuesta
        const confirmText = `Reserva pre-cargada en el calendario. Total: $${total.toLocaleString('es-AR')} | Seña 50%: $${sena.toLocaleString('es-AR')}. Esperamos el comprobante para confirmar.`;
        finalReply = finalReply.replace(markerMatch[0], confirmText);
      } catch (e: any) {
        console.error(`[handler] ✗ Error creando reserva auto:`, e.message);
        const errMsg = e.message;

        // Mensaje inteligente para Paula según tipo de error
        let instruction = '';
        if (errMsg.includes('fechas deben ser') || errMsg.includes('YYYY-MM-DD') || errMsg.includes('Invalid Date')) {
          instruction = `INSTRUCCIÓN PARA PAULA: Las fechas "${ci || '?'}" → "${co || '?'}" no son válidas. Necesito fechas EXACTAS en formato YYYY-MM-DD. Pedile al cliente que te diga fechas concretas (ej. "15 de julio de 2026"). NO vuelvas a emitir el marker [CREAR_RESERVA] hasta que el cliente te dé fechas explícitas.`;
        } else if (errMsg.includes('Marker incompleto')) {
          instruction = `INSTRUCCIÓN PARA PAULA: Faltan datos. Revisá: cabana=${cabanaName}, ci=${ci}, co=${co}, personas=${personasStr}, nombre=${nombre}, telefono=${telefono}. Pedí al cliente lo que falte. NO vuelvas a emitir [CREAR_RESERVA] hasta tener todos los datos.`;
        } else if (errMsg.includes('no encontrada')) {
          instruction = `INSTRUCCIÓN PARA PAULA: La cabaña "${cabanaName}" no existe en el catálogo. Solo podés elegir cabañas que aparecen en el bloque DISPONIBILIDAD. Pedile al cliente que elija otra.`;
        } else if (errMsg.includes('admite hasta')) {
          instruction = `INSTRUCCIÓN PARA PAULA: La cabaña ${cabanaName} no admite ${personasStr} personas. Decile al cliente cuál es la capacidad máxima y ofrecé alternativas.`;
        } else if (errMsg.includes('ocupado')) {
          instruction = `INSTRUCCIÓN PARA PAULA: La cabaña ${cabanaName} está ocupada en esas fechas. Decile al cliente que no está disponible y ofrecé alternativas del bloque DISPONIBILIDAD.`;
        } else if (errMsg.includes('pasado')) {
          instruction = `INSTRUCCIÓN PARA PAULA: Las fechas indicadas ya pasaron. Decile al cliente en su idioma y pedile fechas futuras.`;
        } else {
          instruction = `INSTRUCCIÓN PARA PAULA: Error al crear la reserva (${errMsg.substring(0, 80)}). Derivá al cliente con un asesor humano. NO reintentes el marker.`;
        }

        // Marcar que ya se intentó emitir el marker en esta conversación
        // para que Paula no lo reintente (guard en buildIguazufallsExtras)
        db.setReservationState(convo.id, serializeState({ step: 'marker_failed', attempt: Date.now() } as any));

        finalReply = finalReply.replace(markerMatch[0], instruction);
      }
      } // cierre del else (no había event_id previo)
    }
  }

  // ── Anti-ban: variar patrón de typing ──────────────────────────
  const wasTyping = !skipTyping; // solo manipular si mandamos typing
  if (wasTyping) {
    // 30%: mantener composing unos segundos extra (simula relectura)
    if (Math.random() < KEEP_TYPING_CHANCE) {
      const extraComposingMs = randomDelayMs(1_500, 4_000);
      await sleep(extraComposingMs);
    }
    await provider.stopTyping(msg.from);

    // 20%: ráfaga de "reescritura" después de una pausa
    if (Math.random() < TYPING_BURST_CHANCE) {
      const pauseMs = randomDelayMs(1_000, 3_000);
      await sleep(pauseMs);
      await provider.sendTyping(msg.from);
      const burstMs = randomDelayMs(800, 2_000);
      await sleep(burstMs);
      await provider.stopTyping(msg.from);
    }
  }

  if (AI_REPLY_DELAY_ENABLED) {
    const delayMs = humanDelayMs(finalReply.length, AI_REPLY_DELAY_MIN_MS, AI_REPLY_DELAY_MAX_MS);
    console.log(`[handler] Human delay: ${delayMs}ms para ${finalReply.length} chars`);
    await sleep(delayMs);
  }

  insertMessage(convo.id, 'assistant', finalReply);

  // ── Guard de seguridad: NUNCA enviar texto interno al cliente ──────
  if (IS_IGUAZU) {
    if (finalReply.includes('DISPONIBILIDAD —') || finalReply.includes('INSTRUCCIÓN PARA PAULA')) {
      console.error('[handler] ⚠️ TEXTO INTERNO DETECTADO en finalReply — eliminando');
      finalReply = finalReply
        .replace(/DISPONIBILIDAD\s*—[\s\S]*?(?=\n\n[^\n]|\n*$)/g, '')
        .replace(/INSTRUCCIÓN PARA PAULA:[\s\S]*/g, '')
        .trim();
    }
  }

  await provider.sendMessage(msg.from, finalReply);
  console.log(`[handler] -> Enviado a ${msg.from}`);

  // Auto-clear cart + guardar pedido: SOLO para Impasto
  if (_tenant.dataSource === 'insforge') {
    const hasReceipt = finalReply.includes('Pedido:') &&
                       finalReply.includes('Nombre:') &&
                       finalReply.match(/total[:\s]*\$/i) !== null;
    if (hasReceipt) {
      // Guardar pedido en Insforge antes de limpiar carrito
      const cart = getCart(msg.from);
      const nombreMatch = finalReply.match(/Nombre:\s*(.+)/);
      const pagoMatch = finalReply.match(/Pago:\s*(.+)/);
      const dirMatch = finalReply.match(/Direccion:\s*(.+)/);
      const nombreCliente = nombreMatch ? nombreMatch[1].trim() : msg.senderName || 'Sin nombre';
      const metodoPago = pagoMatch ? pagoMatch[1].trim() : '';
      const direccion = dirMatch ? dirMatch[1].trim() : '';
      const tipoEntrega = cart.orderType || 'delivery';

      savePedidoToInsforge({
        nombre_cliente: nombreCliente,
        telefono_cliente: msg.from,
        direccion,
        productos: cart.items.map(i => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
        total: calculateTotal(msg.from),
        metodo_pago: metodoPago,
        tipo_entrega: tipoEntrega,
      }).then(ok => {
        if (ok) console.log(`[handler] Pedido guardado en Insforge para ${msg.from}`);
      });

      clearCart(msg.from);
      console.log(`[handler] Receipt detectado → carro limpiado para ${msg.from}`);
    }
  }
}
