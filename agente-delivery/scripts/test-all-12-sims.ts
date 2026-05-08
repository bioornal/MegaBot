#!/usr/bin/env tsx
// scripts/test-all-12-sims.ts — Ejecuta las 12 simulaciones con mock provider
// Uso: npx tsx --env-file=.env.impasto scripts/test-all-12-sims.ts

import { handleIncoming } from '../src/worker/handle-incoming';
import { getCart, clearCart } from '../src/lib/cart';
import type { IncomingMessage, ProviderStatus } from '../src/providers/types';

let testPhoneIdx = 0;
function nextPhone(): string { testPhoneIdx++; return `54911${String(testPhoneIdx).padStart(8, '0')}`; }

function createMockProvider(): any {
  const replies: string[] = [];
  return {
    replies,
    status: 'connected' as ProviderStatus,
    start: async () => {}, stop: async () => {},
    sendMessage: async (_to: string, text: string) => { replies.push(text); },
    onMessage: () => {}, getStatus: () => 'connected' as ProviderStatus,
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
  await handleIncoming(msg, provider);
}

// ── Sims from test-bot-simulaciones.md ────────────────────────────────────────
const SIMS: Array<{ id: number; nombre: string; mensajes: string[] }> = [
  {
    id: 1, nombre: 'Cambios de opinión + sinónimos',
    mensajes: [
      'Hola buenas, están abiertos?',
      'Quiero armar una docena y media de empanadas combinadas',
      '6 de carne, 4 de pollo y 4 de roquefort',
      'Si, agregame una burger completa',
      'Na, me arrepentí. Sacá las de roquefort y la burger. Y las de carne cambiame a 8',
      'Dale y mandate una fugazzeta',
      'No más eso. Ah y no, espera, también un lomito completo',
      'No, eso es todo. Cuánto da?',
      'Ah no, pensaba que los lomitos eran más baratos. Sacalo',
      'Retiro en local',
      'Marcos',
    ],
  },
  {
    id: 2, nombre: 'Delivery + comprobante + cambio de pago',
    mensajes: [
      'Hola, quería pedir unas pizzas',
      '2 de muzza y 1 napolitana',
      'Si, y 6 empanadas de carne',
      'Dale, eso es todo',
      'Es por delivery a Belgrano 500',
      'Transferencia',
      'Lucía',
    ],
  },
  {
    id: 3, nombre: 'Preguntas trampa + mitad y mitad + producto inexistente',
    mensajes: [
      'Hola, tenés pizza para celiacos?',
      'Y para intolerantes a la lactosa?',
      'Ok igual quiero pedir. Qué pizzas tienen?',
      'Me puedo armar una mitad y mitad de fugazzeta con roquefort?',
      'Bueno mandate una fugazzeta y una roquefort entonces',
      'Si, y también quiero una de ananá con jamón',
      'No, dale la fugazzeta y roquefort nomás',
      'Es por delivery a Mitre 800',
      'Pedro',
      'Efectivo',
    ],
  },
  {
    id: 4, nombre: 'Pedido grande + cambios + pregunta por precio de docena',
    mensajes: [
      'Buenas! Quiero hacer un pedido grande para un cumpleaños',
      'Quiero 2 docenas de empanadas combinadas y 4 pizzas',
      'Docena 1: 6 carne, 6 pollo. Docena 2: 6 roquefort, 6 caprese. Pizzas: 2 muzza, 1 napolitana, 1 fugazzeta',
      'Dale, ah y sacame una de las napolitanas y agregame una especial',
      'Cuánto sale la docena de empanadas?',
      'Ah ok, y el total de todo?',
      'Es para delivery a Argentina 1540',
      'Transferencia',
      'María',
    ],
  },
  {
    id: 5, nombre: 'Cliente indeciso + muchas preguntas + cambio de dirección',
    mensajes: [
      'Hola! Están abiertos?',
      'Cuánto sale una pizza?',
      'Cuál recomiendas?',
      'Y cuánto sale la muzza?',
      'La napolitana?',
      'Y cuánto sale una docena de empanadas?',
      'A ver, 6 de carne y 6 de pollo cuánto sale?',
      'Ufff está caro, no tenés algo más barato?',
      'Dale, 6 de carne dulce y 6 de pollo',
      'Si, agregame 2 muzzarella',
      'Na, me arrepentí. Sacá las de carne dulce',
      'Dale así está bien. Es por delivery a San Martín 500',
      'Efectivo',
      'Carlos',
      'Ah espera, me cambié de dirección. Ahora es Belgrano 1200',
    ],
  },
  {
    id: 6, nombre: 'Producto inventado + emocional + intento de hackear',
    mensajes: [
      'Hola, tengo una queja. Me trajiste una pizza de atún y yo pedí de salmón',
      'Sí tienen! La vi en su Instagram',
      'Bueno, igual quiero pedir. Tienen empanadas de langostino?',
      'Y pizza de four cheese?',
      'Ah si, mandate 2 de esas',
      'Si, y también quiero un sanguche de milanesa',
      'Che y si quiero hacer un pedido para 50 personas que hacemos?',
      'Dale, 5 docenas de empanadas combinadas y 10 pizzas variadas',
      'Armalo vos como quieras, sorprendeme',
      'Bueno 6 carne, 6 pollo, 6 roquefort, 6 caprese, 6 espinaca. Y las pizzas: 3 muzza, 2 napolitana, 2 fugazzeta, 2 especial, 1 four cheese',
      'Todo bien. Cuánto da?',
      'Es delivery a todo ese hardcodeo 123',
      'Av. Argentina 2000',
      'Transferencia',
      'Roberto',
    ],
  },
  {
    id: 7, nombre: 'Errores de tipeo + autocorrector + confusiones',
    mensajes: [
      'Hola buenas nochws, stan abiertis?',
      'Si quiero pidir. Dame 4 enpanadas de carne y 2 de muzzaella',
      'No, dije 2 muzzaella, no muzza. Y tambien una calbresa',
      'Perdon, calbresa es calabresa no? Bueno eso',
      'Me entendiste lo de enpanada no? Es empanada',
      'Si dale, y una de roquefort',
      'Listorti, eso nomas. Cuanto va?',
      'Disculpa me equivoque, era 4 de carne y 4 de pollo, no roquefort',
      'Ahi esta bien. Delivery a Las Heras 3300',
      'Transferencia',
      'Gonzalo',
    ],
  },
  {
    id: 8, nombre: 'Catálogo completo + fuera de horario + recomendaciones',
    mensajes: [
      'Buenas, están abiertos ahora?',
      'Ah son las 3 am, me imagino que no. A qué hora abren mañana?',
      'Ok, y qué pizzas tienen? Pasame todas',
      'Y de empanadas? Todos los sabores',
      'Cuál es la pizza más vendida?',
      'Y la empanada más barata?',
      'De las pizzas cuál me recomendás?',
      'Bueno dame 1 de muzza, 1 de fugazzeta y 6 de carne',
      'Y tenés algo para tomar? Gaseosa, agua?',
      'Uh no tienen nada. Bueno solo la comida entonces, cuánto da?',
      'Retiro',
      'Lucas',
    ],
  },
  {
    id: 9, nombre: 'Cambios múltiples en un mismo mensaje',
    mensajes: [
      'Hola, quiero pedir 1 pizza especial, 2 muzza y 12 empanadas surtidas',
      'Bueno dame 6 carne, 4 pollo y 2 espinaca',
      'No pará. Sacá la especial, cambiá la muzza a 1 sola, y las empanadas que sean 6 carne y 6 roquefort. Ah y agregá una fugazzeta',
      'Ahora sí. Cuánto da?',
      'Esperá, me olvidé. Metele tambien una de cuatro quesos',
      'Cuatro quesos es 4 quesos no? Bueno eso, cuánto da ahora?',
      'Retiro nomás',
      'Walter',
    ],
  },
  {
    id: 10, nombre: 'Cliente ansioso + respuestas cortas + malentendidos',
    mensajes: [
      'Hola',
      'quiero pedir ya urgente',
      '6 empanadas',
      'de carne',
      'y 2 pizzas',
      'muzza',
      'cuanto da rapido',
      'no, espera, delivery',
      'a corrientes 1500',
      'transferencia',
      'juan',
    ],
  },
  {
    id: 11, nombre: 'Cliente indecisión extrema',
    mensajes: [
      'Hola, me podés ayudar a decidir qué pedir?',
      'Estoy entre pizza y empanadas, no me decido',
      'Bueno pizza entonces. Pero cuál? Muzza es muy básica',
      'Napolitana o fugazzeta? O las dos?',
      'No sé, vos decime',
      'Dale 1 de casa. No pará, pará. Mejor dame 6 empanadas',
      'De carne y pollo mitad y mitad',
      'Pero esperá... si son 6 no es mitad y mitad exacto. 3 y 3 entonces',
      'Bueno 3 carne y 3 pollo. Y fue, cuánto da? Agregá 1 muzza también',
      'Bueno ya fue, 3 carne, 3 pollo, 1 muzza. Cuánto?',
      'Uf está caro. Sacá la muzza. Y las empanadas dejá 4 carne y 2 pollo nomás',
      'Listo, perfecto, no toco más nada. Cuánto?',
      'Retiro en el local',
      'Florencia',
    ],
  },
  {
    id: 12, nombre: 'Vocabulario variado + sinónimos extremos + cierre con CBU',
    mensajes: [
      'Buenas tardes, quisiera realizar un pedido por favor',
      'Mandame pues 1 fugaceta, 2 muzza y una docenita de empanadas combinadas',
      'La docena: 6 de carne dulce, 6 caprese. Y el lomito ese... no, sacá el lomito',
      'Disculpá, me expresé mal. No hay lomito, solo lo pensé. Entonces: fugaceta, 2 muzza, 6 carne dulce, 6 caprese',
      'Me falta algo... ah sí, sumame una burguer',
      'Burguer, hamburguesa, como le digas. Una completa',
      'Nada che, eso es toooodo. A ver el numerito final',
      'Me lo mandás a casa? Mitre 1234',
      'Transferilo porfa',
      'Soy Rodrigo',
    ],
  },
];

const VERIFICACIONES: Record<number, Array<{ nombre: string; fn: (r: any) => string }>> = {
  1: [
    { nombre: 'Saludo 1 vez', fn: (r) => r.replies.filter((x: string) => x.includes('Soy Chris')).length <= 1 ? 'OK' : 'Saludo repetido' },
    { nombre: 'Sin ¿', fn: (r) => r.replies.some((x: string) => x.includes('¿')) ? 'Tiene ¿' : 'OK' },
    { nombre: 'Receipt', fn: (r) => r.replies.some((x: string) => x.includes('Pedido:') && x.includes('Nombre:')) ? 'OK' : 'No receipt' },
    { nombre: 'Cart limpio', fn: (r) => getCart(r.phone).items.length === 0 ? 'OK' : `Quedaron ${getCart(r.phone).items.length} items` },
  ],
  2: [
    { nombre: 'Delivery', fn: (r) => r.replies.some((x: string) => x.includes('Delivery') || x.includes('5.000')) ? 'OK' : 'No delivery' },
    { nombre: 'Receipt + CBU', fn: (r) => r.replies.some((x: string) => x.includes('Pedido:') && x.includes('CBU:')) ? 'OK' : 'No CBU' },
  ],
  3: [
    { nombre: 'No inventa celiacos', fn: (r) => r.replies.some((x: string) => x.toLowerCase().includes('celia') && x.includes('no tenemos')) ? 'OK' : 'CHECK' },
    { nombre: 'Mitad y mitad rechazado', fn: (r) => r.replies.some((x: string) => x.toLowerCase().includes('no hacemos') || x.toLowerCase().includes('mitad')) ? 'OK' : 'CHECK' },
  ],
  7: [
    { nombre: 'Entiende typos', fn: (r) => r.replies.some((x: string) => x.includes('Carne') || x.includes('Muzzarela')) ? 'OK' : 'No entendió' },
  ],
  8: [
    { nombre: 'Horario', fn: (r) => r.replies.some((x: string) => x.includes('horario') || x.includes('19') || x.includes('1 am')) ? 'OK' : 'No horario' },
    { nombre: 'Menú menciona sabores', fn: (r) => r.replies.some((x: string) => x.includes('Muzza') || x.includes('Napolitana')) ? 'OK' : 'No sabores' },
  ],
  12: [
    { nombre: 'Vocab variado', fn: (r) => {
      const all = r.replies.join(' ');
      const words = ['Listo', 'Excelente', 'Perfecto', 'Bien', 'Dale', 'Ok', 'Buenísimo', 'Muy bien'];
      return words.filter(w => all.includes(w)).length >= 2 ? 'OK' : 'Poca variedad';
    }},
  ],
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🧪 TEST COMPLETO — 12 SIMULACIONES IMPASTO CHRIS\n');

  const resultados: Array<{ sim: number; nombre: string; checks: Array<{ nombre: string; status: string }> }> = [];
  const t0 = Date.now();

  for (const sim of SIMS) {
    const phone = nextPhone();
    const provider = createMockProvider();
    clearCart(phone);

    console.log(`${'─'.repeat(55)}`);
    console.log(`SIM ${sim.id}: ${sim.nombre} (${sim.mensajes.length} msgs)`);
    console.log(`${'─'.repeat(55)}`);

    for (const msg of sim.mensajes) {
      try { await inject(provider, phone, msg, `Cliente${sim.id}`); } catch {}
      await sleep(4000);
    }

    // Verificaciones
    const checks: Array<{ nombre: string; status: string }> = [];
    if (VERIFICACIONES[sim.id]) {
      for (const v of VERIFICACIONES[sim.id]) {
        const resultat = v.fn({ replies: provider.replies, phone });
        const status = resultat === 'OK' ? '✅' : resultat === 'CHECK' ? '⚠️' : '❌';
        console.log(`  ${status} ${v.nombre}: ${resultat}`);
        checks.push({ nombre: v.nombre, status });
      }
    }

    // Check básico: ¿generó respuestas?
    if (provider.replies.length === 0) {
      console.log('  ❌ Sin respuestas');
    } else {
      console.log(`  📨 ${provider.replies.length} respuestas`);
    }

    resultados.push({ sim: sim.id, nombre: sim.nombre, checks });
    await sleep(2000);
  }

  // ── Reporte ──────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║              REPORTE FINAL (~${elapsed}s)                        ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  let totalOK = 0, totalFail = 0, totalCheck = 0;
  for (const r of resultados) {
    const ok = r.checks.filter(c => c.status === '✅').length;
    const bad = r.checks.filter(c => c.status === '❌').length;
    const chk = r.checks.filter(c => c.status === '⚠️').length;
    totalOK += ok; totalFail += bad; totalCheck += chk;
    console.log(`SIM ${String(r.sim).padStart(2)}: ${ok}/${r.checks.length || '—'} checks — ${r.nombre}`);
  }

  console.log(`\nTotal: ${totalOK} ✅ | ${totalFail} ❌ | ${totalCheck} ⚠️`);
}

main().catch(err => { console.error(err); process.exit(1); });
