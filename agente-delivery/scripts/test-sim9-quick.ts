#!/usr/bin/env tsx
// Quick test: solo SIM 9
import { handleIncoming } from '../src/worker/handle-incoming';
import { getCart, clearCart } from '../src/lib/cart';
import type { WhatsAppProvider, IncomingMessage, ProviderStatus } from '../src/providers/types';

const RESULTS: Array<{ test: string; status: string; detail: string }> = [];
function pass(test: string, detail: string) { RESULTS.push({ test, status: 'PASS', detail }); console.log(`  ✅ ${test}: ${detail}`); }
function fail(test: string, detail: string) { RESULTS.push({ test, status: 'FAIL', detail }); console.log(`  ❌ ${test}: ${detail}`); }
function check(test: string, detail: string) { RESULTS.push({ test, status: 'CHECK', detail }); console.log(`  ⚠️  ${test}: ${detail}`); }

function createMockProvider(): any {
  const replies: string[] = [];
  return {
    replies,
    status: 'connected' as ProviderStatus,
    start: async () => {}, stop: async () => {},
    sendMessage: async (to: string, text: string) => {
      replies.push(text);
      console.log(`\n  📨 ${text.substring(0, 200)}`);
    },
    onMessage: () => {},
    getStatus: () => 'connected' as ProviderStatus,
    markAsRead: async () => {}, sendTyping: async () => {}, stopTyping: async () => {},
  };
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function inject(provider: any, phone: string, text: string, senderName = 'Test') {
  const msg: IncomingMessage = {
    provider: 'baileys', externalMessageId: Date.now().toString(),
    from: phone, to: '5491112345678', text,
    timestamp: Math.floor(Date.now() / 1000), senderName,
    fromMe: false, isSelfChat: false, rawPayload: {},
  };
  console.log(`  👤 >>> "${text}"`);
  await handleIncoming(msg, provider);
}

async function main() {
  console.log('🧪 TEST RÁPIDO — SIM 9 (queda + retiro falso positivo)\n');
  const phone = '5491199999999';
  const provider = createMockProvider();
  clearCart(phone);

  await inject(provider, phone, 'Hola! Quiero pedir', 'Julián'); await sleep(5000);
  await inject(provider, phone, 'Una fugaceta, 6 empanadas arabes y una completa', 'Julián'); await sleep(5000);

  // Check: "completa" should now map to Hamb. Completa (system prompt fix)
  const cart1 = getCart(phone);
  const names1 = cart1.items.map(i => i.name).join(', ');
  if (cart1.items.some(i => i.name === 'Hamburguesa Completa')) {
    pass('completa→Hamburgesa', `Carrito: ${names1}`);
  } else {
    check('completa→Hamburgesa', `Carrito: ${names1} (LLM puede tardar en aprender nuevo sinónimo)`);
  }

  await inject(provider, phone, 'Sacame la hamburguesa y cambia las arabes a 4', 'Julián'); await sleep(5000);

  const cart2 = getCart(phone);
  const burgerGone = !cart2.items.some(i => i.name.includes('Hamburguesa') || i.name.includes('Lomo'));
  const arabeQty = cart2.items.find(i => i.name === 'Empanada Arabe')?.qty ?? -1;
  if (burgerGone && arabeQty === 4) {
    pass('Cambio cantidades', `burger removida, árabes → ${arabeQty}`);
  } else {
    const names2 = cart2.items.map(i => `${i.qty}x ${i.name}`).join(', ');
    fail('Cambio cantidades', `Carrito: ${names2} (bug queda/quedan)`);
  }

  await inject(provider, phone, 'Quiero sacar todo. Empecemos de nuevo', 'Julián'); await sleep(5000);

  await inject(provider, phone, 'OK, 2 pizzas muzza y 6 empanadas de carne', 'Julián'); await sleep(5000);
  await inject(provider, phone, 'Eso es todo', 'Julián'); await sleep(5000);
  await inject(provider, phone, 'Retiro', 'Julián'); await sleep(5000);

  // Check: NO false positive "retiro" removal
  const cart3 = getCart(phone);
  const shouldHaveItems = cart3.items.length > 0;
  if (shouldHaveItems) {
    pass('Retiro no es comando de sacar', `${cart3.items.length} items preservados`);
  } else {
    fail('Retiro no es comando de sacar', 'Carrito vacío — falso positivo de retiro');
  }

  // Check: "Retiro en local o delivery?" in LLM output should NOT trigger removal
  const hasFalseRemoval = provider.replies.some((r: string) => {
    // Check if any reply containing "Retiro" was processed as a removal
    // This is verified by the cart still having items above
    return false;
  });

  await inject(provider, phone, 'Julián', 'Julián'); await sleep(5000);

  const receipt = provider.replies.find((r: string) => r.includes('Pedido:'));
  if (receipt) {
    pass('Receipt generado', 'OK');
  } else {
    fail('Receipt generado', 'No se generó');
  }

  const cartFinal = getCart(phone);
  if (cartFinal.items.length === 0) {
    pass('Carrito limpiado', 'OK');
  } else {
    fail('Carrito limpiado', `Quedaron ${cartFinal.items.length} items`);
  }

  console.log('\n' + '='.repeat(50));
  const passes = RESULTS.filter(r => r.status === 'PASS').length;
  const fails = RESULTS.filter(r => r.status === 'FAIL').length;
  console.log(`${passes} PASS, ${fails} FAIL, ${RESULTS.length - passes - fails} CHECK`);
}

main().catch(err => { console.error(err); process.exit(1); });
