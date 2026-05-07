import { getDb } from '../lib/db';
import { getAIReply } from '../lib/openai';
import { buildSystemPrompt } from '../lib/system-prompt';
import { getCatalogContext } from '../lib/catalog';
import { getCompanyInfoContext } from '../lib/company-info';
import { randomDelayMs, sleep, humanDelayMs } from '../lib/delay';
import type { WhatsAppProvider, IncomingMessage } from '../providers/types';
import { getTenantById } from '../tenants.config';
import { detectIntent, extractPeople } from '../lib/intent-iguazufalls';
import { findCabanasByCapacity, fetchCabanas, getCabanaByName } from '../lib/catalog';
import { checkAvailability, createReservationEvent } from '../lib/calendar-gcal';
import { getSeason } from '../lib/season';
import { parseState, serializeState, type ReservationState } from '../lib/reservation-state';
import { verifyPaymentReceipt } from '../lib/verify-payment';

const AI_REPLY_DELAY_MIN_MS = 3_000;
const AI_REPLY_DELAY_MAX_MS = 20_000;
const AI_REPLY_DELAY_ENABLED = process.env.AI_REPLY_DELAY !== 'false';

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

async function buildIguazufallsExtras(
  msg: IncomingMessage,
  conversationId: number
): Promise<string> {
  // Cargar estado de reserva del SQLite (vacío si nunca se inició una reserva).
  const stateJson = db.getReservationState(conversationId);
  const state: ReservationState | null = parseState(stateJson);
  const intent = detectIntent(msg.text ?? '', !!msg.mediaUrl);
  const blocks: string[] = [];

  // === Caso COMPROBANTE ===
  if (intent.intent === 'receipt' && state?.step === 'awaiting_receipt' && msg.mediaUrl && state.sena) {
    try {
      const result = await verifyPaymentReceipt({
        imageUrl: msg.mediaUrl,
        expectedAmount: state.sena,
        bankAlias: process.env.BANK_ALIAS ?? 'iguazufalls.test',
        bankCBU: process.env.BANK_CBU ?? '',
        bankTitular: process.env.BANK_TITULAR ?? 'IguazuFalls',
      });
      const tag = result.ok
        ? 'OK'
        : result.issue === 'wrong_account' ? 'WRONG_ACCOUNT'
        : result.issue === 'amount_mismatch' ? 'AMOUNT_MISMATCH'
        : 'UNREADABLE';
      blocks.push(`COMPROBANTE: ${tag}\nDetalle: ${'detail' in result ? result.detail : 'verificado'}`);
    } catch (e) {
      blocks.push(`COMPROBANTE: UNREADABLE\nDetalle: error técnico al analizar`);
    }
    return blocks.join('\n\n');
  }

  // === Caso DISPONIBILIDAD ===
  if (intent.intent === 'availability' && intent.hasPeople) {
    const personas = extractPeople(msg.text) ?? state?.personas;
    if (personas) {
      const candidatas = await findCabanasByCapacity(personas, _tenant.productsTable);
      if (candidatas.length > 0) {
        const checkIn = state?.check_in;
        const lines = [`DISPONIBILIDAD — opciones para ${personas} personas:`];
        for (const c of candidatas) {
          let precio = '';
          let libre = '';
          if (checkIn && state?.check_out) {
            const season = getSeason(new Date(checkIn + 'T12:00:00-03:00'));
            const p = season === 'alta' ? c.precio_alta : season === 'media' ? c.precio_media : c.precio_baja;
            precio = ` — $${p.toLocaleString('es-AR')}/noche (${season})`;
            try {
              const free = await checkAvailability(c.calendar_id, checkIn, state.check_out);
              libre = free ? ' ✅' : ' ❌ ocupado';
            } catch {
              libre = '';
            }
          }
          lines.push(`- ${c.nombre} (${c.capacidad_max}p, ${c.metros2}m²)${precio}${libre}`);
        }
        blocks.push(lines.join('\n'));
      } else {
        blocks.push(`DISPONIBILIDAD: ninguna cabaña admite ${personas} personas (máximo por unidad: 6).`);
      }
    }
  }

  return blocks.join('\n\n');
}

const ADMIN_HELP =
  'Comandos disponibles:\n' +
  '#ia NUMERO — activar modo IA\n' +
  '#humano NUMERO — activar modo humano\n' +
  '#reset NUMERO — borrar memoria\n\n' +
  'Ejemplo: #humano 5491112345678';

async function handleAdminCommand(
  msg: IncomingMessage,
  provider: WhatsAppProvider
): Promise<void> {
  const parts = msg.text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const digits = (parts[1] ?? '').replace(/\D/g, '');

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

  await provider.markAsRead(msg);
  await provider.sendTyping(msg.from);

  console.log(`[handler] Obteniendo companyInfoContext (tabla: ${_tenant.companyInfoTable})...`);
  const companyInfoContext = await getCompanyInfoContext(_tenant.companyInfoTable);
  console.log(`[handler] companyInfoContext length: ${companyInfoContext.length}`);

  console.log(`[handler] Obteniendo catalogContext (tabla: ${_tenant.productsTable}) para: "${msg.text}"`);
  const catalogContext = await getCatalogContext(msg.text, _tenant.productsTable);
  console.log(`[handler] catalogContext length: ${catalogContext.length}`);

  let extras = '';
  if (IS_IGUAZU) {
    extras = await buildIguazufallsExtras(msg, convo.id);
    console.log(`[handler] iguazufalls extras length: ${extras.length}`);
  }

  const fullSystemPrompt = [SYSTEM_PROMPT, companyInfoContext, catalogContext, extras]
    .filter(Boolean)
    .join('\n\n');

  console.log(`[handler] fullSystemPrompt length: ${fullSystemPrompt.length}`);
  console.log(`[handler] llmMessages:`, llmMessages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.substring(0, 50) : '[multi]' })));

  const reply = await getAIReply(llmMessages, fullSystemPrompt);
  console.log(`[handler] LLM respondio en ${Date.now() - start}ms, reply length: ${reply.length}`);
  console.log(`[handler] LLM reply: "${reply.substring(0, 200)}..."`);

  await provider.stopTyping(msg.from);

  if (AI_REPLY_DELAY_ENABLED) {
    const delayMs = humanDelayMs(reply.length, AI_REPLY_DELAY_MIN_MS, AI_REPLY_DELAY_MAX_MS);
    console.log(`[handler] Human delay: ${delayMs}ms para ${reply.length} chars`);
    await sleep(delayMs);
  }

  insertMessage(convo.id, 'assistant', reply);
  await provider.sendMessage(msg.from, reply);
  console.log(`[handler] -> Enviado a ${msg.from}`);
}
