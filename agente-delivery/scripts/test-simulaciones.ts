#!/usr/bin/env tsx
// scripts/test-simulaciones.ts — Test de las 6 simulaciones de Impasto Chris
// Uso: cd agente-delivery && npx tsx scripts/test-simulaciones.ts
//
// Approach: mocking a nivel de imports para evitar iniciar Baileys/YCloud de verdad.
// Se injecta el cart y el LLM directamente para verificar matemática y parsing.

import * as path from 'path';

// Simular process.env antes de cualquier import
process.env.TENANT_ID = 'impasto';
process.env.WORKER_PORT = '3003';
process.env.DATA_DIR = './data/impasto';
process.env.AI_REPLY_DELAY = 'false';
process.env.WHATSAPP_PROVIDER = 'baileys';
process.env.OPENAI_API_KEY = 'sk-test';

// ── Mock Baileys provider ────────────────────────────────────────────────────
const respuestas: string[] = [];

const mockProvider = {
  sendMessage: async (_to: string, text: string) => {
    console.log(`  [BOT] → ${text.substring(0, 80)}${text.length > 80 ? '...' : ''}`);
    respuestas.push(text);
  },
  markAsRead: async () => {},
  sendTyping: async () => {},
  stopTyping: async () => {},
  start: async () => { console.log('[mock provider] started'); },
  stop: async () => {},
};

// ── Cargar cart y system prompt directamente ──────────────────────────────────
import { getCart, clearCart, calculateTotal } from '../src/lib/cart';
import { buildSystemPrompt } from '../src/lib/system-prompt';
import { getTenantById } from '../src/tenants.config';
import { getMenuContextFromInsforge, getCompanyInfoFromInsforge } from '../src/lib/insforge-client';

const TENANT = getTenantById('impasto')!;
const SYSTEM_PROMPT = buildSystemPrompt(TENANT.botName, TENANT.name);

// ── Simular handleIncoming simplificado ─────────────────────────────────────
// (sin el loop real de mensaje - solo para test de cart parsing + math)

const phone = '5491112345678@test';

// ── Simulaciones ─────────────────────────────────────────────────────────────
const SIMULACIONES = [
  {
    id: 1,
    nombre: 'Cambios de opinión + sinónimos + productos inexistentes',
    mensajes: [
      { txt: 'Hola buenas, están abiertos?', expectGreeting: true },
      { txt: 'Quiero armar una docena y media de empanadas combinadas', expectGreeting: false },
      { txt: '6 de carne, 4 de pollo y 4 de roquefort', expectGreeting: false },
      { txt: 'Si, agregame una burger completa', expectGreeting: false },
      { txt: 'Na, me arrepentí. Sacá las de roquefort y la burger. Y las de carne cambiame a 8', expectGreeting: false },
      { txt: 'Dale y mandate una fugazzeta', expectGreeting: false },
      { txt: 'No más eso. Ah y no, espera, también un lomito completo', expectGreeting: false },
      { txt: 'No, eso es todo. Cuánto da?', expectGreeting: false },
      { txt: 'Ah no, pensaba que los lomitos eran más baratos. Sacalo', expectGreeting: false },
      { txt: 'Retiro en local', expectGreeting: false },
      { txt: 'Marcos', expectGreeting: false },
    ],
    cartEsperadoFinal: {
      items: [
        { name: 'Empanada Carne', qty: 8, unitPrice: 3200 },
        { name: 'Empanada Pollo', qty: 4, unitPrice: 3200 },
        { name: 'Pizza Fugazzeta', qty: 1, unitPrice: 16000 },
      ],
      deliveryFee: 0,
      totalEsperado: 54400,
    },
  },
  {
    id: 2,
    nombre: 'Delivery + comprobante incorrecto + cambio de pago',
    mensajes: [
      { txt: 'Hola, quería pedir unas pizzas', expectGreeting: true },
      { txt: '2 de muzza y 1 napolitana', expectGreeting: false },
      { txt: 'Si, y 6 empanadas de carne', expectGreeting: false },
      { txt: 'Dale, eso es todo', expectGreeting: false },
      { txt: 'Es por delivery a Belgrano 500', expectGreeting: false },
      { txt: 'Transferencia', expectGreeting: false },
      { txt: 'Lucía', expectGreeting: false },
    ],
    cartEsperadoFinal: {
      items: [
        { name: 'Pizza Muzzarela', qty: 2, unitPrice: 15000 },
        { name: 'Pizza Napolitana', qty: 1, unitPrice: 18000 },
        { name: 'Empanada Carne', qty: 6, unitPrice: 3200 },
      ],
      deliveryFee: 5000,
      totalEsperado: 2*15000 + 1*18000 + 6*3200 + 5000, // = 30000+18000+19200+5000 = 72200
    },
  },
];

// ── LLM simulado ─────────────────────────────────────────────────────────────
// Para simular las respuestas del LLM sin hacer llamadas reales a OpenAI
// Nos enfocamos en verificar el CART PARSING (la matemática que fallaba antes)

import { parseCartFromLLMReply, addToCart, removeFromCart, updateItemQty } from '../src/lib/cart';
import { generateTotalReply, generateReceiptReply } from '../src/lib/cart';

function simularLLMRespuesta(phone: string, texto: string, isFirst: boolean): string {
  const lower = texto.toLowerCase().trim();

  // Saludo
  if (isFirst) {
    return 'Hola! Soy Chris de Impasto. Sí, trabajamos mar-dom. Qué te gustaría pedir?';
  }

  // Cantidades de empanadas sin flavors → preguntar
  if (lower.includes('docena') && lower.includes('empanada') && !lower.match(/\d+\s+(carne|pollo|roquefort)/)) {
    return 'Cuántas querés de cada sabor?';
  }

  // Items específicos
  const items: Array<{ pattern: RegExp; action: string; reply: string }> = [
    { pattern: /6.*carne.*4.*pollo.*4.*roquefort/, action: 'add', reply: 'Listo, agrego 6 Carne, 4 Pollo y 4 Roquefort. Querés agregar algo más?' },
    { pattern: /burger.*complet|hamburguesa/, action: 'add', reply: 'Listo, agrego 1 Hamburguesa Completa. Querés agregar algo más?' },
    { pattern: /sacá.*roquefort.*burger.*carne.*8|cambia.*carne.*8/, action: 'modify', reply: 'Listo, saco las de Roquefort y la burger. Queda 8 Carne y 4 Pollo. Querés agregar algo más?' },
    { pattern: /fugazzeta/, action: 'add', reply: 'Listo, agrego 1 Pizza Fugazzeta. Querés agregar algo más?' },
    { pattern: /lomito completo/, action: 'add', reply: 'Listo, agrego 1 Lomo Completo. Querés agregar algo más?' },
    { pattern: /cuánto da|cuanto es/, action: 'total', reply: 'El total es $69.400 (8 Carne a $3.200 + 4 Pollo a $3.200 + 1 Fugazzeta a $16.000 + 1 Lomo Completo a $15.000). Decime si es retiro o delivery.' },
    { pattern: /saco.*lomo|sacalo/, action: 'remove', reply: 'Listo, saco el Lomo Completo. El total es $54.400. Decime si es retiro o delivery.' },
    { pattern: /retiro en local|retiro$/, action: 'order', reply: 'Retiro sin costo en Av. San Martin 1245. Pasame tu nombre.' },
    { pattern: /^marcos$/i, action: 'confirm', reply: 'Pedido:\n8 Empanadas Carne ($3.200 c/u = $25.600)\n4 Empanadas Pollo ($3.200 c/u = $12.800)\n1 Pizza Fugazzeta ($16.000)\nTotal: $54.400\nRetiro: Av. San Martin 1245\nNombre: Marcos\n\nTe confirmamos pronto.' },
    { pattern: /2.*muzza.*1.*napolitana/, action: 'add', reply: 'Listo, agrego 2 Pizza Muzzarela y 1 Pizza Napolitana. Querés agregar algo más?' },
    { pattern: /6.*empanadas.*carne|empanadas.*carne.*6/, action: 'add', reply: 'Listo, agrego 6 Empanadas Carne. Querés agregar algo más?' },
    { pattern: /delivery.*belgrano|belgrano.*500/, action: 'delivery', reply: 'Perfecto. La dirección es Belgrano 500. Decime nombre y forma de pago.' },
  ];

  for (const item of items) {
    if (lower.match(item.pattern)) {
      return item.reply;
    }
  }

  return 'Querés agregar algo más?';
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function logCart(phone: string, label: string) {
  const cart = getCart(phone);
  const total = calculateTotal(phone);
  const lines = cart.items.map(i => `  ${i.qty}x ${i.name} @ $${i.unitPrice} = $${i.qty * i.unitPrice}`);
  if (cart.deliveryFee > 0) lines.push(`  delivery $${cart.deliveryFee}`);
  lines.push(`  TOTAL: $${total}`);
  console.log(`  ${label}:`);
  lines.forEach(l => console.log(l));
}

async function runSimulacion(sim: typeof SIMULACIONES[0]) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SIM ${sim.id}: ${sim.nombre}`);
  console.log('═'.repeat(60));

  clearCart(phone);
  respuestas.length = 0;

  let isFirst = true;
  for (let i = 0; i < sim.mensajes.length; i++) {
    const msg = sim.mensajes[i];
    const texto = msg.txt;
    console.log(`\n[${i + 1}] Usuario: "${texto}"`);

    const reply = simularLLMRespuesta(phone, texto, isFirst);
    console.log(`  [BOT] ${reply.substring(0, 80)}${reply.length > 80 ? '...' : ''}`);

    respuestas.push(reply);

    // Parsear cart desde la respuesta del LLM
    parseCartFromLLMReply(phone, reply);

    // Si es paso de entrega, setear orderType
    if (texto.toLowerCase().includes('retiro')) {
      const { setOrderType } = await import('../src/lib/cart');
      setOrderType(phone, 'retiro');
    }
    if (texto.toLowerCase().includes('delivery')) {
      const { setOrderType } = await import('../src/lib/cart');
      setOrderType(phone, 'delivery');
    }

    logCart(phone, 'Carrito actual');
    isFirst = false;
  }

  // Verificar carrito final
  console.log('\n--- Verificación ---');
  const cart = getCart(phone);
  const total = calculateTotal(phone);

  const errors: string[] = [];

  // Verificar items
  for (const expected of sim.cartEsperadoFinal.items) {
    const found = cart.items.find(i => i.name === expected.name);
    if (!found) {
      errors.push(`Item faltante: ${expected.name} (esperado qty=${expected.qty})`);
    } else if (found.qty !== expected.qty) {
      errors.push(`Qty incorrecta de ${expected.name}: got ${found.qty}, want ${expected.qty}`);
    } else if (found.unitPrice !== expected.unitPrice) {
      errors.push(`Precio incorrecto de ${expected.name}: got $${found.unitPrice}, want $${expected.unitPrice}`);
    }
  }

  // Verificar delivery fee
  if (cart.deliveryFee !== sim.cartEsperadoFinal.deliveryFee) {
    errors.push(`Delivery fee incorrecto: got $${cart.deliveryFee}, want $${sim.cartEsperadoFinal.deliveryFee}`);
  }

  // Verificar total
  if (total !== sim.cartEsperadoFinal.totalEsperado) {
    errors.push(`Total incorrecto: got $${total}, want $${sim.cartEsperadoFinal.totalEsperado}`);
  }

  if (errors.length === 0) {
    console.log('  ✅ Carrito final CORRECTO');
  } else {
    console.log(`  ❌ ${errors.length} error(es):`);
    errors.forEach(e => console.log(`     - ${e}`));
  }

  return { errores: errors, respuestas };
}

async function main() {
  console.log('🧪 TEST SIMULACIONES — Impasto Chris');
  console.log('   Enfoque: verificar cart parsing + matemática');
  console.log('   (sin conexión WhatsApp real, LLM simulado)\n');

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         VERIFICACIÓN DE MATEMÁTICA DEL CARRO               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const resultados: Array<{ id: number; status: 'OK' | 'FAIL'; errores: string[] }> = [];

  for (const sim of SIMULACIONES) {
    try {
      const result = await runSimulacion(sim);
      resultados.push({ id: sim.id, status: result.errores.length === 0 ? 'OK' : 'FAIL', errores: result.errores });
    } catch (err: any) {
      resultados.push({ id: sim.id, status: 'FAIL', errores: [err.message] });
    }
  }

  // ── Sim 3-6: verificación conceptual (sin math) ──────────────────────────────
  const conceptualChecks: Array<{ id: number; nombre: string; checks: string[] }> = [
    {
      id: 3,
      nombre: 'Preguntas trampa + mitad y mitad + producto inexistente',
      checks: [
        '❓ Celíaco → "no tenemos opciones para celiacos"',
        '❓ Lactosa → "derivá al equipo"',
        '❌ Mitad y mitad → PROHIBIDO en pizzas',
        '❌ Four cheese → debe pedir "Pizza 4 Quesos" (synonym), no "four cheese" puro',
        '✅ Langostino → NO existe, debe decir "no tenemos eso"',
      ],
    },
    {
      id: 4,
      nombre: 'Pedido grande + cambios + pregunta precio',
      checks: [
        '✅ Precio docena empanadas → derivation correcta (12 * $3.200 = $38.400)',
        '✅ Cambios parciales → no tocar items no mencionados',
        '✅ Cambios: sacar napolitana → queda 3 pizzas (2 muzza, 1 fugazzeta, 1 especial)',
        '✅ Delivery: + $5.000',
      ],
    },
    {
      id: 5,
      nombre: 'Cliente indeciso + cambio dirección',
      checks: [
        '✅ Pregunta precio pizza → sin totals intermedios',
        '✅ "carne dulce" → synonym de "Empanada Carne Dulce"',
        '✅ "muzzarella" → "Pizza Muzzarela"',
        '✅ Cambio dirección post-resumen → NO repetir resumen, solo confirmar',
      ],
    },
    {
      id: 6,
      nombre: 'Producto inventado + hackear',
      checks: [
        '❌ Atún → NO EXISTE → debe decir "no tenemos eso"',
        '❌ Langostino → NO EXISTE → debe decir "no tenemos eso"',
        '❌ "four cheese" → synonym funciona, $18.000',
        '❌ Sanguche de milanesa → NO EXISTE → debe decir "no tenemos eso"',
        '❌ "armalo vos" → PROHIBIDO → responder "no hacemos pedidos sin elección"',
        '✅ 5 docenas: 6 carne + 6 pollo + 6 roquefort + 6 caprese + 6 espinaca',
        '✅ 10 pizzas: 3 muzza + 2 napolitana + 2 fugazzeta + 2 especial + 1 four cheese',
        '✅ Cálculo: (6+6+6+6+6)*$3.200 + (3+2+2+2+1)*$16.000-$18.000 = 30*$3.200 + 10*pizzas',
      ],
    },
  ];

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         CHECKS CONCEPTUALES (Sim 3-6)                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  for (const c of conceptualChecks) {
    console.log(`\n🔍 SIM ${c.id}: ${c.nombre}`);
    c.checks.forEach(check => console.log(`   ${check}`));
  }

  // ── Reporte final ────────────────────────────────────────────────────────────
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    REPORTE FINAL                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  let passed = 0;
  for (const r of resultados) {
    const icon = r.status === 'OK' ? '✅' : '❌';
    console.log(`${icon} SIM ${r.id}: ${r.status}`);
    if (r.errores.length > 0) r.errores.forEach(e => console.log(`   ❌ ${e}`));
    passed += r.status === 'OK' ? 1 : 0;
  }

  console.log('\n📊 Math Tests (Sim 1-2):');
  console.log(`   ${passed}/${resultados.length} pasadas`);
  console.log('\n📊 Conceptual Tests (Sim 3-6):');
  console.log('   4 pendientes de verificar manualmente con el bot real');
  console.log('\n⚠️  Para test completo, ejecutar en WhatsApp real con las 6 simulaciones');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});