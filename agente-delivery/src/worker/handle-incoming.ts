import { getDb } from '../lib/db';
import { getAIReply } from '../lib/openai';
import { buildSystemPrompt } from '../lib/system-prompt';
import { getCatalogContext } from '../lib/catalog';
import { getCompanyInfoContext } from '../lib/company-info';
import { getMenuContextFromInsforge, getCompanyInfoFromInsforge, savePedidoToInsforge, getPricesMap } from '../lib/insforge-client';
import { randomDelayMs, sleep, humanDelayMs } from '../lib/delay';
import { getCart, clearCart, calculateTotal, addToCart, removeFromCart, updateItemQty, parseCartFromLLMReply, canonicalName, setOrderType, generateTotalReply, syncPrices, arePricesLoaded, type Cart } from '../lib/cart';
import type { WhatsAppProvider, IncomingMessage } from '../providers/types';
import { getTenantById } from '../tenants.config';

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
  const companyInfoContext = _tenant.dataSource === 'insforge'
    ? await getCompanyInfoFromInsforge()
    : await getCompanyInfoContext(_tenant.companyInfoTable);
  console.log(`[handler] companyInfoContext length: ${companyInfoContext.length}`);

  console.log(`[handler] Obteniendo catalogContext (tabla: ${_tenant.productsTable}) para: "${msg.text}"`);
  const catalogContext = _tenant.dataSource === 'insforge'
    ? await getMenuContextFromInsforge(msg.text)
    : await getCatalogContext(msg.text, _tenant.productsTable);
  console.log(`[handler] catalogContext length: ${catalogContext.length}`);

  // Sync prices from Insforge into cart module (solo para Impasto)
  if (_tenant.dataSource === 'insforge' && !arePricesLoaded()) {
    const prices = await getPricesMap();
    if (Object.keys(prices).length > 0) syncPrices(prices);
  }

  const cartForContext = getCart(msg.from);
  let cartContext = '';
  if (cartForContext.items.length > 0) {
    const cartLines = cartForContext.items.map(i => `- ${i.qty}x ${i.name} ($${i.unitPrice}/u)`);
    if (cartForContext.deliveryFee > 0) cartLines.push(`- Delivery $${cartForContext.deliveryFee}`);
    const cartTotal = calculateTotal(msg.from);
    cartContext = `\n\n[CARRITO ACTUAL]\n${cartLines.join('\n')}\nTotal: $${cartTotal}`;
    console.log(`[handler] Cart context: ${cartContext}`);
  }

  const fullSystemPrompt = [SYSTEM_PROMPT, companyInfoContext, catalogContext]
    .filter(Boolean)
    .join('\n\n') + cartContext;

  console.log(`[handler] fullSystemPrompt length: ${fullSystemPrompt.length}`);
  console.log(`[handler] llmMessages:`, llmMessages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.substring(0, 50) : '[multi]' })));

  const reply = await getAIReply(llmMessages, fullSystemPrompt);
  console.log(`[handler] LLM respondio en ${Date.now() - start}ms, reply length: ${reply.length}`);
  console.log(`[handler] LLM reply: "${reply.substring(0, 200)}..."`);

  // Actualizar carrito basado en lo que el LLM confirmó
  parseCartFromLLMReply(msg.from, reply);

  // Detectar si el cliente pide total EXPLÍCITAMENTE
  // Solo "cuánto da" / "cuanto da" / "cuánto es" / "cuanto es" disparan generateTotalReply
  // Frases como "eso es todo", "solo eso", "no agrego nada" las maneja el LLM vía system prompt
  // (el prompt tiene lógica de contradicciones: si el cliente agrega items después, NO muestra total)
  // Detectar delivery/retiro ANTES de cualquier corrección de total
  // El fee debe estar en el cart antes de comparar con el total del LLM
  const lowerMsg = msg.text.toLowerCase();
  const isDelivery = lowerMsg.includes('delivery') ||
                     lowerMsg.includes('envío a ') ||
                     lowerMsg.includes('enviame a ') ||
                     lowerMsg.includes('mandame a ') ||
                     (lowerMsg.match(/^(?:es por|a|mandame|env[ií]o)\s+a\s+\w/) !== null);
  const isRetiro = !isDelivery && (lowerMsg.includes('retiro') || lowerMsg.includes('en local'));

  if (isDelivery) {
    setOrderType(msg.from, 'delivery');
    console.log(`[handler] Delivery detectado → fee $5000 agregado`);
  } else if (isRetiro) {
    setOrderType(msg.from, 'retiro');
    console.log(`[handler] Retiro detectado → fee $0`);
  }

  const cartStateAfterOrder = getCart(msg.from);
  let finalReply = reply;

  // SIEMPRE corregir el total del LLM con el del carrito (math exacta)
  // Con delivery fee ya incluido en cartStateAfterOrder
  const cartTotal = calculateTotal(msg.from);
  const totalMatch = reply.match(/total[:\s]*\$?([0-9.,]+)/i);
  if (totalMatch) {
    const llmTotal = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
    if (Math.abs(cartTotal - llmTotal) > 0) {
      console.log(`[handler] Cart total $${cartTotal} vs LLM total ${totalMatch[1]} → replacing`);
      finalReply = finalReply.replace(/total[:\s]*\$?([0-9.,]+)/gi, 'Total: $$' + cartTotal.toLocaleString('es-AR'));
    }
  }

  await provider.stopTyping(msg.from);

  if (AI_REPLY_DELAY_ENABLED) {
    const delayMs = humanDelayMs(finalReply.length, AI_REPLY_DELAY_MIN_MS, AI_REPLY_DELAY_MAX_MS);
    console.log(`[handler] Human delay: ${delayMs}ms para ${finalReply.length} chars`);
    await sleep(delayMs);
  }

  insertMessage(convo.id, 'assistant', finalReply);
  await provider.sendMessage(msg.from, finalReply);
  console.log(`[handler] -> Enviado a ${msg.from}`);

  // Auto-clear cart después de confirmar el pedido (receipt final = paso 6)
  // El receipt se identifica por: "Pedido:" + "Nombre:" + "Total:"
  // Esto evita que el carro persista para futuras conversaciones del mismo cliente
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
