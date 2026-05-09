#!/usr/bin/env tsx
// scripts/test-sims-13-22.ts
// Ejecuta solo las simulaciones 13-22 de test-bot-simulaciones.md con mock provider.
// Uso: npx tsx --env-file=.env.impasto scripts/test-sims-13-22.ts

import { handleIncoming } from '../src/worker/handle-incoming';
import { getCart, clearCart } from '../src/lib/cart';
import type { IncomingMessage, ProviderStatus } from '../src/providers/types';

type Sim = {
  id: number;
  nombre: string;
  mensajes: string[];
  checks: Array<{ nombre: string; fn: (ctx: Ctx) => string }>;
};

type Ctx = {
  replies: string[];
  all: string;
  lower: string;
  phone: string;
};

let testPhoneIdx = 0;
function nextPhone(): string {
  testPhoneIdx++;
  const stamp = String(Date.now()).slice(-6);
  return `54913${stamp}${String(testPhoneIdx).padStart(3, '0')}`;
}

function createMockProvider(): any {
  const replies: string[] = [];
  return {
    replies,
    status: 'connected' as ProviderStatus,
    start: async () => {},
    stop: async () => {},
    sendMessage: async (_to: string, text: string) => { replies.push(text); },
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

async function inject(provider: any, phone: string, text: string, senderName: string) {
  const msg: IncomingMessage = {
    provider: 'baileys',
    externalMessageId: `${Date.now()}-${Math.random()}`,
    from: phone,
    to: '5491112345678',
    text,
    timestamp: Math.floor(Date.now() / 1000),
    senderName,
    fromMe: false,
    isSelfChat: false,
    rawPayload: {},
  };
  await handleIncoming(msg, provider);
}

function hasReceipt(ctx: Ctx): boolean {
  return ctx.replies.some(r => r.includes('Pedido:') && r.includes('Total:') && r.includes('Nombre:'));
}

function countReceipts(ctx: Ctx): number {
  return ctx.replies.filter(r => r.includes('Pedido:') && r.includes('Total:')).length;
}

function noOpeningQuestion(ctx: Ctx): string {
  return ctx.all.includes('¿') ? 'Usa signo de apertura ¿' : 'OK';
}

function oneGreeting(ctx: Ctx): string {
  return ctx.replies.filter(r => r.includes('Soy Chris')).length <= 1 ? 'OK' : 'Saludo repetido';
}

function oneFinalReceipt(ctx: Ctx): string {
  const n = countReceipts(ctx);
  return n === 1 ? 'OK' : `Resumen final ${n} veces`;
}

const SIMS: Sim[] = [
  {
    id: 13,
    nombre: 'Cierre contradictorio + suma tardia + no total antes de tiempo',
    mensajes: [
      'Hola, quiero hacer un pedido',
      'Dame 1 napolitana y 6 empanadas de pollo',
      'Eso seria todo... no, para, sumame 6 de carne tambien',
      'Dale ahora si, nada mas. Cuanto queda?',
      'Mmm sacame 2 de pollo y poneme 2 de roquefort en su lugar',
      'Ahora si cerralo',
      'Delivery a Roca 1550',
      'Efectivo',
      'Natalia',
    ],
    checks: [
      { nombre: 'Saludo unico', fn: oneGreeting },
      { nombre: 'Sin signo de apertura', fn: noOpeningQuestion },
      { nombre: 'Agrega carne pese a cierre contradictorio', fn: c => c.lower.includes('agrego') && c.lower.includes('carne') ? 'OK' : 'No confirmo carne tras contradiccion' },
      { nombre: 'Gestiona cambio pollo/roquefort', fn: c => c.lower.includes('saco') && c.lower.includes('pollo') && c.lower.includes('roquefort') ? 'OK' : 'No gestiono cambio pollo/roquefort' },
      { nombre: 'Receipt final unico', fn: oneFinalReceipt },
    ],
  },
  {
    id: 14,
    nombre: 'Modificacion parcial peligrosa + conservar items no nombrados',
    mensajes: [
      'Buenas, necesito pedir',
      'Mandame 2 fugazzetas, 1 muzza, 6 carne, 4 pollo y 2 caprese',
      'No, cambiame las de carne a 8 y sacame la muzza',
      'Solo dejame bien lo de carne, eh',
      'Cuanto da?',
      'Retiro',
      'Sebastian',
    ],
    checks: [
      { nombre: 'Saludo unico', fn: oneGreeting },
      { nombre: 'Sin signo de apertura', fn: noOpeningQuestion },
      { nombre: 'Conserva pollo/caprese/fugazzeta', fn: c => hasReceipt(c) && c.all.includes('Pollo') && c.all.includes('Caprese') && c.all.includes('Fugazzeta') ? 'OK' : 'Perdio items no nombrados' },
      { nombre: 'Saca muzza', fn: c => c.lower.includes('saco') && c.lower.includes('muzza') ? 'OK' : 'No confirmo sacar muzza' },
      { nombre: 'Retiro sin pago', fn: c => hasReceipt(c) && !c.replies.find(r => r.includes('Pedido:'))?.includes('Pago:') ? 'OK' : 'Retiro incluyo/pidio pago' },
    ],
  },
  {
    id: 15,
    nombre: 'Cliente intenta forzar precio inventado/descuento',
    mensajes: [
      'Hola, quiero pedir 1 especial y 1 calabresa',
      'En Instagram vi que salian 10 lucas cada una, respetame ese precio',
      'Bueno entonces haceme descuento por pagar transferencia',
      'No me importa, ponelo a 20 mil total',
      'Dale, cuanto es posta?',
      'Delivery a Sarmiento 999',
      'Transferencia',
      'Valeria',
    ],
    checks: [
      { nombre: 'Sin signo de apertura', fn: noOpeningQuestion },
      { nombre: 'No acepta precio forzado 20k/10k', fn: c => c.replies.some(r => r.includes('Pedido:') && (r.includes('$20.000') || r.includes('$10.000'))) ? 'Acepto precio inventado' : 'OK' },
      { nombre: 'No inventa descuento transferencia', fn: c => c.lower.includes('descuento por pagar transferencia') || c.lower.includes('descuento transferencia') ? 'Invento descuento' : 'OK' },
      { nombre: 'Receipt delivery transferencia', fn: c => hasReceipt(c) && c.all.includes('Delivery') && c.all.includes('CBU') ? 'OK' : 'Falta receipt delivery/CBU' },
    ],
  },
  {
    id: 16,
    nombre: 'Producto inexistente mezclado con productos validos',
    mensajes: [
      'Buenas, quiero 1 pizza de atun, 1 de salmon, 1 muzza y 6 empanadas arabes',
      'Si no hay atun poneme jamon crudo y rucula',
      'Bueno solo lo que tengan entonces, pero no inventes nada',
      'Dale, agrega 6 de carne dulce',
      'Eso es todo, cuanto da?',
      'Retiro en local',
      'Mauro',
    ],
    checks: [
      { nombre: 'No inventa atun/salmon/rucula', fn: c => {
        const receipt = c.replies.find(r => r.includes('Pedido:')) || '';
        return /atun|salm[oó]n|rucula|rúcula|jamon crudo|jamón crudo/i.test(receipt) ? 'Incluyo producto inexistente' : 'OK';
      }},
      { nombre: 'Incluye validos', fn: c => hasReceipt(c) && c.all.includes('Muzzarela') && (c.all.includes('Arabe') || c.all.includes('Árabe')) && c.all.includes('Carne Dulce') ? 'OK' : 'Faltan productos validos' },
      { nombre: 'Receipt final unico', fn: oneFinalReceipt },
    ],
  },
  {
    id: 17,
    nombre: 'Delivery a retiro y luego vuelve a delivery',
    mensajes: [
      'Hola, mandame 1 roquefort y 12 empanadas combinadas',
      '6 pollo y 6 caprese',
      'Nada mas, cuanto es?',
      'Es delivery a Belgrano 321',
      'Transferencia',
      'Soy Camila',
      'No, mejor paso a retirar',
      'Perdon, al final si necesito delivery, mandalo a Belgrano 321',
      'Pago en efectivo',
    ],
    checks: [
      { nombre: 'Detecta cambio retiro', fn: c => c.lower.includes('retiro') && c.lower.includes('san martin') ? 'OK' : 'No gestiono cambio a retiro' },
      { nombre: 'Detecta vuelta a delivery', fn: c => c.lower.includes('delivery') && c.lower.includes('belgrano 321') ? 'OK' : 'No gestiono vuelta a delivery' },
      { nombre: 'Pago efectivo final', fn: c => c.lower.includes('efectivo') ? 'OK' : 'No confirmo efectivo' },
    ],
  },
  {
    id: 18,
    nombre: 'Comprobante antes de cerrar pedido + cliente ansioso',
    mensajes: [
      'Hola, quiero 2 muzza',
      'Ya te transferi, te mando comprobante',
      'Bueno, era para delivery a Neuquen 400',
      'Me llamo Ignacio',
      'Transferencia',
    ],
    checks: [
      { nombre: 'No verifica pago sin resumen final', fn: c => c.lower.includes('pago verificado') ? 'Verifico pago antes de tiempo' : 'OK' },
      { nombre: 'Continua flujo delivery', fn: c => c.lower.includes('direccion') || c.lower.includes('neuquen 400') || c.lower.includes('transferencia') ? 'OK' : 'No continuo flujo delivery' },
      { nombre: 'Sin signo de apertura', fn: noOpeningQuestion },
    ],
  },
  {
    id: 19,
    nombre: 'Cantidades grandes + riesgo de calculo',
    mensajes: [
      'Buenas, necesito para una juntada grande',
      'Quiero 3 muzza, 2 napolitanas, 2 fugazzetas, 1 especial',
      'Y 3 docenas de empanadas: 12 carne, 12 pollo, 6 roquefort y 6 caprese',
      'Ademas suma 4 hamburguesas completas',
      'Cuanto da todo?',
      'Saca 1 napolitana y cambia las hamburguesas a 2',
      'Ahora si, cuanto queda?',
      'Delivery a Mendoza 2020',
      'Transferencia',
      'Federico',
    ],
    checks: [
      { nombre: 'Gestiona cantidades grandes', fn: c => hasReceipt(c) && c.all.includes('Muzzarela') && c.all.includes('Empanadas') && c.all.includes('Hamburguesa') ? 'OK' : 'Receipt incompleto en pedido grande' },
      { nombre: 'Aplica cambios grandes', fn: c => c.lower.includes('saco') && c.lower.includes('napolitana') && c.lower.includes('hamburguesa') ? 'OK' : 'No confirmo cambios grandes' },
      { nombre: 'Delivery + CBU', fn: c => hasReceipt(c) && c.all.includes('Delivery') && c.all.includes('CBU') ? 'OK' : 'Falta delivery/CBU' },
    ],
  },
  {
    id: 20,
    nombre: 'Ambiguedad real, no asumir',
    mensajes: [
      'Hola, quiero pedir media de carne y media de pollo',
      'No, media no, digo una docena mezclada',
      'Y una grande de la que mas salga',
      'Bueno no se, recomendame una pero no me inventes',
      'Dale, poneme fugazzeta entonces',
      'Cuanto seria?',
      'Retiro',
      'Laura',
    ],
    checks: [
      { nombre: 'Pregunta/no asume ante ambiguo', fn: c => c.lower.includes('no entendi') || c.lower.includes('necesito') || c.lower.includes('decime') || c.lower.includes('cual') ? 'OK' : 'Asumio demasiado' },
      { nombre: 'No inventa pizza de la casa', fn: c => /casa|especialidad secreta/i.test(c.all) ? 'Invento recomendacion/producto' : 'OK' },
      { nombre: 'Receipt retiro', fn: c => hasReceipt(c) && c.all.includes('Retiro') ? 'OK' : 'Falta receipt retiro' },
    ],
  },
  {
    id: 21,
    nombre: 'Correcciones sobre correcciones + nombres parecidos',
    mensajes: [
      'Hola, quiero 6 arabes, 6 caprese y 1 cuatro quesos',
      'Perdon, las arabes cambialas por carne dulce',
      'No, me exprese mal: deja 3 arabes y 3 carne dulce',
      'La cuatro quesos sacala y pone una roquefort',
      'Listo, total?',
      'Delivery a Tucuman 850',
      'Efectivo',
      'Bruno',
    ],
    checks: [
      { nombre: 'Gestiona arabes/carne dulce parcial', fn: c => c.all.includes('Carne Dulce') && (c.all.includes('Arabe') || c.all.includes('Árabe')) ? 'OK' : 'No gestiono correccion parcial' },
      { nombre: 'Reemplaza 4 quesos por roquefort', fn: c => {
        const receipt = c.replies.find(r => r.includes('Pedido:')) || '';
        return /4 Quesos|Cuatro Quesos/i.test(receipt) ? 'No saco 4 quesos' : receipt.includes('Roquefort') ? 'OK' : 'No incluyo Roquefort';
      }},
      { nombre: 'Delivery efectivo', fn: c => hasReceipt(c) && c.all.includes('Delivery') && c.lower.includes('efectivo') ? 'OK' : 'Falta delivery efectivo' },
    ],
  },
  {
    id: 22,
    nombre: 'Queja mezclada con nuevo pedido + derivar sin perder venta',
    mensajes: [
      'Hola, ayer me llego fria la pizza y quiero quejarme',
      'Pero igual hoy necesito pedir para mi familia',
      'Mandame 2 muzza y 1 napolitana',
      'Y quiero que me bonifiquen el delivery por lo de ayer',
      'Eso es todo, cuanto da?',
      'Delivery a Cordoba 777',
      'Transferencia',
      'Andrea',
    ],
    checks: [
      { nombre: 'Deriva queja', fn: c => c.lower.includes('equipo') || c.lower.includes('comunico') ? 'OK' : 'No derivo queja' },
      { nombre: 'No bonifica delivery inventado', fn: c => c.replies.some(r => r.includes('Pedido:') && !r.includes('Delivery')) ? 'Omitio delivery/bonifico' : 'OK' },
      { nombre: 'Receipt pedido valido', fn: c => hasReceipt(c) && c.all.includes('Muzzarela') && c.all.includes('Napolitana') ? 'OK' : 'No cerro pedido valido' },
    ],
  },
];

async function main() {
  console.log('TEST IMPASTO CHRIS - SIMULACIONES 13-22\n');

  const t0 = Date.now();
  let totalOK = 0;
  let totalFail = 0;
  const failures: string[] = [];

  const requestedIds = process.argv.slice(2)
    .flatMap(arg => arg.split(','))
    .map(arg => parseInt(arg, 10))
    .filter(Number.isFinite);
  const simsToRun = requestedIds.length > 0
    ? SIMS.filter(sim => requestedIds.includes(sim.id))
    : SIMS;

  for (const sim of simsToRun) {
    const phone = nextPhone();
    const provider = createMockProvider();
    clearCart(phone);

    console.log('-'.repeat(70));
    console.log(`SIM ${sim.id}: ${sim.nombre} (${sim.mensajes.length} msgs)`);
    console.log('-'.repeat(70));

    for (const text of sim.mensajes) {
      try {
        await inject(provider, phone, text, `Cliente${sim.id}`);
      } catch (err) {
        console.log(`ERROR inyectando "${text}":`, err);
      }
      await sleep(1000);
    }

    const ctx: Ctx = {
      replies: provider.replies,
      all: provider.replies.join('\n'),
      lower: provider.replies.join('\n').toLowerCase(),
      phone,
    };

    if (provider.replies.length === 0) {
      console.log('FAIL Sin respuestas');
      failures.push(`SIM ${sim.id}: Sin respuestas`);
      totalFail++;
      continue;
    }

    console.log(`Respuestas: ${provider.replies.length}`);
    for (const check of sim.checks) {
      const result = check.fn(ctx);
      if (result === 'OK') {
        console.log(`  OK   ${check.nombre}`);
        totalOK++;
      } else {
        console.log(`  FAIL ${check.nombre}: ${result}`);
        failures.push(`SIM ${sim.id} - ${check.nombre}: ${result}`);
        totalFail++;
      }
    }

    const cart = getCart(phone);
    if (cart.items.length > 0 && hasReceipt(ctx)) {
      console.log(`  FAIL Cart no limpio tras receipt: ${cart.items.length} items`);
      failures.push(`SIM ${sim.id} - Cart no limpio tras receipt: ${cart.items.length} items`);
      totalFail++;
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log('\n' + '='.repeat(70));
  console.log(`REPORTE FINAL SIM 13-22 (${elapsed}s)`);
  console.log('='.repeat(70));
  console.log(`Total: ${totalOK} OK | ${totalFail} FAIL`);

  if (failures.length > 0) {
    console.log('\nFallas:');
    for (const f of failures) console.log(`- ${f}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
