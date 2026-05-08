#!/usr/bin/env tsx
// scripts/test-impasto-fixes.ts — Testea los fixes del Impasto bot
// NO requiere WhatsApp. Usa mock provider y llama a handleIncoming directo.
// Uso: npx tsx --env-file=.env.impasto scripts/test-impasto-fixes.ts

import { handleIncoming } from '../src/worker/handle-incoming';
import { getCart, clearCart, calculateTotal } from '../src/lib/cart';
import type { WhatsAppProvider, IncomingMessage, ProviderStatus } from '../src/providers/types';

const RESULTS: Array<{ sim: string; test: string; status: 'PASS' | 'FAIL' | 'CHECK'; detail: string }> = [];
let testPhoneIdx = 0;
function nextPhone(): string {
  testPhoneIdx++;
  return `54911${String(testPhoneIdx).padStart(8, '0')}`;
}

function pass(sim: string, test: string, detail: string) {
  RESULTS.push({ sim, test, status: 'PASS', detail });
  console.log(`  ✅ ${test}: ${detail}`);
}
function fail(sim: string, test: string, detail: string) {
  RESULTS.push({ sim, test, status: 'FAIL', detail });
  console.log(`  ❌ ${test}: ${detail}`);
}
function check(sim: string, test: string, detail: string) {
  RESULTS.push({ sim, test, status: 'CHECK', detail });
  console.log(`  ⚠️  ${test}: ${detail}`);
}

// ── Mock provider ──────────────────────────────────────────────────────────────
function createMockProvider(): WhatsAppProvider & { replies: string[] } {
  const replies: string[] = [];
  return {
    replies,
    start: async () => {},
    stop: async () => {},
    sendMessage: async (to: string, text: string) => {
      replies.push(text);
      console.log(`\n  📨 RESPUESTA:\n${text.split('\n').map(l => `     │ ${l}`).join('\n')}\n`);
    },
    onMessage: () => {},
    getStatus: () => 'connected' as ProviderStatus,
    markAsRead: async () => {},
    sendTyping: async () => {},
    stopTyping: async () => {},
  };
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function inject(provider: any, phone: string, text: string, senderName = 'Test') {
  const msg: IncomingMessage = {
    provider: 'baileys',
    externalMessageId: Date.now().toString(),
    from: phone,
    to: '5491112345678',
    text,
    timestamp: Math.floor(Date.now() / 1000),
    senderName,
    fromMe: false,
    isSelfChat: false,
    rawPayload: {},
  };
  console.log(`  👤 >>> "${text}"`);
  await handleIncoming(msg, provider);
}

// ── SIM 7: Vocabulario variado + pedido completo retiro ───────────────────────
async function sim7_VariedVocabulary() {
  const sim = 'SIM7-Vocab';
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SIM 7: Vocabulario variado + pedido completo (retiro)`);
  console.log(`${'═'.repeat(60)}`);

  const phone = nextPhone();
  const provider = createMockProvider();
  clearCart(phone);

  await inject(provider, phone, 'Hola, están abiertos?', 'Mario');
  await sleep(5000);

  await inject(provider, phone, 'Quiero 4 empanadas de carne, 4 de pollo y 1 pizza muzza', 'Mario');
  await sleep(5000);

  await inject(provider, phone, 'Agregame también una napolitana', 'Mario');
  await sleep(5000);

  await inject(provider, phone, 'No, eso es todo. Cuánto da?', 'Mario');
  await sleep(5000);

  await inject(provider, phone, 'Retiro en local', 'Mario');
  await sleep(5000);

  await inject(provider, phone, 'Mario Pérez', 'Mario');
  await sleep(5000);

  // Verificar vocabulario variado
  const allReplies = provider.replies.join(' ');
  const varietyWords = ['Listo', 'Excelente', 'Perfecto', 'Bien', 'Dale', 'Ok', 'Buenísimo', 'Muy bien'];
  const usedWords = varietyWords.filter(w => allReplies.includes(w));
  if (usedWords.length >= 2) {
    pass(sim, 'Vocabulario variado', `Usó ${usedWords.length} palabras distintas: [${usedWords.join(', ')}]`);
  } else if (usedWords.length === 1) {
    check(sim, 'Vocabulario variado', `Solo usó "${usedWords[0]}". Debería alternar más.`);
  } else {
    check(sim, 'Vocabulario variado', 'No se detectó ninguna palabra de confirmación.');
  }

  // Verificar que NO usa ¿
  const hasInvertedQ = allReplies.includes('¿');
  if (!hasInvertedQ) {
    pass(sim, 'Sin ¿ de apertura', 'OK');
  } else {
    fail(sim, 'Sin ¿ de apertura', 'Encontré ¿ en las respuestas');
  }

  // Verificar que completó el pedido
  const hasReceipt = provider.replies.some(r => r.includes('Pedido:') && r.includes('Nombre:'));
  if (hasReceipt) {
    pass(sim, 'Receipt generado', 'OK');
  } else {
    fail(sim, 'Receipt generado', 'No se generó receipt');
  }

  // Verificar carrito limpio
  const cartAfter = getCart(phone);
  if (cartAfter.items.length === 0) {
    pass(sim, 'Carrito limpiado tras pedido', 'OK');
  } else {
    fail(sim, 'Carrito limpiado tras pedido', `Quedaron ${cartAfter.items.length} items`);
  }

  console.log(`\n  📋 Respuestas completas:\n`);
  provider.replies.forEach((r, i) => console.log(`  [${i + 1}] ${r.substring(0, 150)}`));
}

// ── SIM 8: Nuevos patrones (sumo/quito/cambio) + delivery ─────────────────────
async function sim8_NewPatterns() {
  const sim = 'SIM8-Patterns';
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SIM 8: Nuevos patrones (sumo/quito) + delivery con transferencia`);
  console.log(`${'═'.repeat(60)}`);

  const phone = nextPhone();
  const provider = createMockProvider();
  clearCart(phone);

  await inject(provider, phone, 'Buenas, quiero pedir', 'Valentina');
  await sleep(5000);

  await inject(provider, phone, '6 empanadas de carne y 2 lomos completos', 'Valentina');
  await sleep(5000);

  // El bot debería confirmar usando variedad de palabras
  await inject(provider, phone, 'Agregá 4 de roquefort también', 'Valentina');
  await sleep(5000);

  await inject(provider, phone, 'Me arrepentí de los lomos, sacalos', 'Valentina');
  await sleep(5000);

  // Revisar si el carrito reflejó correctamente los cambios
  const cart = getCart(phone);
  const cartItems = cart.items.map(i => `${i.qty}x ${i.name}`).join(', ');
  console.log(`  🛒 Carrito: ${cartItems || '(vacío)'}`);
  const hasCarne = cart.items.some(i => i.name === 'Empanada Carne' && i.qty >= 6);
  const hasRoq = cart.items.some(i => i.name === 'Empanada Roquefort' && i.qty >= 4);
  const hasLomo = cart.items.some(i => i.name.includes('Lomo'));
  if (hasCarne && hasRoq && !hasLomo) {
    pass(sim, 'Carrito con patrones "saco"', `Items: ${cartItems}`);
  } else {
    fail(sim, 'Carrito con patrones "saco"', `Esperaba 6 Carne + 4 Roquefort, sin Lomo. Resultó: ${cartItems}`);
  }

  await inject(provider, phone, 'Esperá, sumo una fugazzeta', 'Valentina');
  await sleep(5000);

  const cart2 = getCart(phone);
  const hasFugaz = cart2.items.some(i => i.name.includes('Fugazzeta'));
  if (hasFugaz) {
    pass(sim, 'Patrón "sumo" detectado', 'Fugazzeta agregada al carrito');
  } else {
    check(sim, 'Patrón "sumo" detectado', 'Fugazzeta no aparece en el carrito');
  }

  await inject(provider, phone, 'Nada más, cuánto es?', 'Valentina');
  await sleep(5000);

  await inject(provider, phone, 'Delivery a Av. Siempreviva 742', 'Valentina');
  await sleep(5000);

  await inject(provider, phone, 'Transferencia', 'Valentina');
  await sleep(5000);

  await inject(provider, phone, 'Valentina Gómez', 'Valentina');
  await sleep(5000);

  // Verificar receipt completo
  const receipt = provider.replies.find(r => r.includes('Pedido:') && r.includes('Nombre:'));
  if (receipt) {
    const hasCBU = receipt.includes('CBU:') || receipt.includes('01105949');
    const hasDelivery = receipt.includes('Delivery') || receipt.includes('5.000');
    pass(sim, 'Receipt delivery', `CBU: ${hasCBU}, Delivery: ${hasDelivery}, Total: ${receipt.match(/Total:\s*\$?([0-9.,]+)/)?.[1] || '?'}`);
  } else {
    fail(sim, 'Receipt delivery', 'No se generó receipt');
  }

  // Verificar carrito limpio
  const cartAfter = getCart(phone);
  if (cartAfter.items.length === 0) {
    pass(sim, 'Carrito limpiado', 'OK');
  } else {
    fail(sim, 'Carrito limpiado', `Quedaron ${cartAfter.items.length} items`);
  }
}

// ── SIM 9: Cambios extremos + retiro + sinónimos ──────────────────────────────
async function sim9_ExtremeChanges() {
  const sim = 'SIM9-Extreme';
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SIM 9: Cambios extremos multi-paso + retiro`);
  console.log(`${'═'.repeat(60)}`);

  const phone = nextPhone();
  const provider = createMockProvider();
  clearCart(phone);

  await inject(provider, phone, 'Hola! Quiero pedir', 'Julián');
  await sleep(5000);

  await inject(provider, phone, 'Una fugaceta, 6 empanadas arabes y una completa', 'Julián');
  await sleep(5000);

  // Verificar sinónimo fugaceta → Fugazzeta
  const cart1 = getCart(phone);
  const fugazMapped = cart1.items.some(i => i.name === 'Pizza Fugazzeta');
  const burgerMapped = cart1.items.some(i => i.name === 'Hamburguesa Completa');
  if (fugazMapped && burgerMapped) {
    pass(sim, 'Sinónimos mapeados', 'fugaceta→Fugazzeta, completa→Hamburguesa Completa');
  } else {
    const names = cart1.items.map(i => i.name).join(', ');
    check(sim, 'Sinónimos mapeados', `Carrito: ${names}`);
  }

  await inject(provider, phone, 'Sacame la hamburguesa y cambia las arabes a 4', 'Julián');
  await sleep(5000);

  const cart2 = getCart(phone);
  const noBurger = !cart2.items.some(i => i.name.includes('Hamburguesa'));
  const arabeOk = cart2.items.some(i => i.name === 'Empanada Arabe' && i.qty === 4);
  if (noBurger && arabeOk) {
    pass(sim, 'Cambio cantidades', 'burger removida, árabes → 4');
  } else {
    fail(sim, 'Cambio cantidades', `Carrito actual: ${cart2.items.map(i => `${i.qty}x ${i.name}`).join(', ')}`);
  }

  await inject(provider, phone, 'Quiero sacar todo. Empecemos de nuevo', 'Julián');
  await sleep(5000);

  const cart3 = getCart(phone);
  // El bot no debería vaciar el carrito por "sacar todo" a menos que entienda el comando
  // Esto es más para ver cómo reacciona el LLM
  console.log(`  🛒 Carrito tras "sacar todo": ${cart3.items.map(i => `${i.qty}x ${i.name}`).join(', ') || '(vacío)'}`);

  await inject(provider, phone, 'OK, 2 pizzas muzza y una docena de empanadas combinadas: 6 pollo, 6 carne', 'Julián');
  await sleep(5000);

  await inject(provider, phone, 'Eso es todo', 'Julián');
  await sleep(5000);

  await inject(provider, phone, 'Retiro', 'Julián');
  await sleep(5000);

  await inject(provider, phone, 'Julián', 'Julián');
  await sleep(5000);

  // Verificar receipt retiro (no debe tener pago)
  const receipt = provider.replies.find(r => r.includes('Pedido:') && r.includes('Nombre:'));
  if (receipt) {
    const hasRetiro = receipt.includes('Retiro') || receipt.includes('San Martin');
    const noPago = !receipt.includes('Pago:');
    if (hasRetiro && noPago) {
      pass(sim, 'Receipt retiro sin pago', 'OK');
    } else {
      check(sim, 'Receipt retiro sin pago', `Retiro: ${hasRetiro}, Pago presente: ${!noPago}`);
    }
  } else {
    fail(sim, 'Receipt retiro', 'No se generó receipt');
  }

  // Verificar carrito limpiado
  const cartAfter = getCart(phone);
  if (cartAfter.items.length === 0) {
    pass(sim, 'Carrito limpiado', 'OK');
  } else {
    fail(sim, 'Carrito limpiado', `Quedaron ${cartAfter.items.length} items`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🧪 TEST DE FIXES — IMPASTO CHRIS (DeepSeek V4 Flash)');
  console.log('   Modo: mock provider (sin WhatsApp)');
  console.log('   3 simulaciones nuevas para validar cambios recientes\n');

  const t0 = Date.now();

  try {
    await sim7_VariedVocabulary();
    await sleep(2000);
    await sim8_NewPatterns();
    await sleep(2000);
    await sim9_ExtremeChanges();
  } catch (err) {
    console.error('\n❌ Error durante tests:', err);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ── Reporte Final ────────────────────────────────────────────────────────────
  console.log(`\n`);
  console.log(`╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║                    REPORTE FINAL (${elapsed}s)                     ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log('');

  const passes = RESULTS.filter(r => r.status === 'PASS').length;
  const fails = RESULTS.filter(r => r.status === 'FAIL').length;
  const checks = RESULTS.filter(r => r.status === 'CHECK').length;

  for (const r of RESULTS) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️ ';
    console.log(`${icon} [${r.sim}] ${r.test}: ${r.detail}`);
  }

  console.log(`\n${passes} passed, ${fails} failed, ${checks} need manual check`);
  console.log(`Total: ${passes + fails + checks} assertions\n`);

  if (fails > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
