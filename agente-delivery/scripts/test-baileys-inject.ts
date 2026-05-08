#!/usr/bin/env tsx
// scripts/test-baileys-inject.ts — Inyecta mensajes reales via worker HTTP
// Uso: npx tsx scripts/test-baileys-inject.ts --status
//        npx tsx scripts/test-baileys-inject.ts --sim 1
//        npx tsx scripts/test-baileys-inject.ts --all
//
// REQUISITO: Worker de Impasto corriendo en puerto 3003
//   npm run worker:dev:impasto

import http from 'node:http';

const WORKER_URL = 'http://127.0.0.1:3003';
const TEST_PHONE = '5491112345678';

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function request(method: string, path: string, body?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, WORKER_URL);
    const opts: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const get = (path: string) => request('GET', path);
const post = (path: string, body: object) => request('POST', path, body);

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Simular mensaje entrante ──────────────────────────────────────────────────
async function inject(from: string, text: string, senderName = 'Test'): Promise<any> {
  return post('/test-inject', { from, text, senderName });
}

// ── Limpiar cart de un número ─────────────────────────────────────────────────
async function resetCart(phone: string): Promise<void> {
  try {
    await post('/test-reset', { from: phone });
    console.log(`  [cart] limpiado para ${phone}`);
  } catch {}
}

// ── Status check ──────────────────────────────────────────────────────────────
async function checkStatus() {
  try {
    const s = await get('/status');
    console.log(`Worker: ${s.status} | Provider: ${s.provider}`);
    if (s.qr) console.log('QR disponible — escanear en WhatsApp');
    // connected/ready son ambos válidos — el bot está activo
    return s.status === 'ready' || s.status === 'connected';
  } catch {
    console.log('❌ Worker no responde en 127.0.0.1:3003');
    console.log('   Ejecutar: npm run worker:dev:impasto');
    return false;
  }
}

// ── Simulaciones ─────────────────────────────────────────────────────────────
const SIMS: Record<number, { nombre: string; mensajes: string[] }> = {
  1: {
    nombre: 'Cambios de opinión + sinónimos',
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
  2: {
    nombre: 'Delivery + comprobante',
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
  3: {
    nombre: 'Preguntas trampa + mitad y mitad',
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
  4: {
    nombre: 'Pedido grande + cambios',
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
  5: {
    nombre: 'Cliente indeciso + cambio dirección',
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
  6: {
    nombre: 'Producto inventado + hackear',
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
};

// ── Ejecutar simulación ───────────────────────────────────────────────────────
async function runSim(simNum: number) {
  const sim = SIMS[simNum];
  if (!sim) { console.log(`Sim ${simNum} no existe. Sims 1-6 disponibles.`); return; }

  // Limpiar cart antes de cada sim para tests limpios
  await resetCart(TEST_PHONE);
  await sleep(500);

  console.log('\n' + '═'.repeat(60));
  console.log(`SIM ${simNum}: ${sim.nombre}`);
  console.log('═'.repeat(60));

  for (let i = 0; i < sim.mensajes.length; i++) {
    const texto = sim.mensajes[i];
    console.log(`\n[${i + 1}/${sim.mensajes.length}] >>> "${texto}"`);
    await inject(TEST_PHONE, texto, `Cliente Sim${simNum}`);
    // Esperar a que el LLM procese y guards logs
    await sleep(4000);
  }

  console.log('\n--- Simulación completada ---');
  console.log('Revisar logs del worker para verificar respuestas del bot.');
}

async function main() {
  console.log('🧪 INYECCIÓN DE MENSAJES — Impasto Chris');
  console.log(`   Worker: ${WORKER_URL}\n`);

  const ready = await checkStatus();
  if (!ready) {
    console.log('\n⚠️  Worker conectado pero estado no es "ready":');
    console.log('   Puede que el QR no esté escaneado aún.');
    console.log('   Verificar que WhatsApp de Impasto esté conectado.');
    const s = await get('/status');
    console.log(`   Estado actual: ${s.status}`);
    process.exit(1);
  }

  const arg = process.argv[2];

  if (arg === '--status') {
    const s = await get('/status');
    console.log(JSON.stringify(s, null, 2));
  } else if (arg === '--sim' && process.argv[3]) {
    const n = parseInt(process.argv[3]);
    await runSim(n);
  } else if (arg === '--all') {
    for (let i = 1; i <= 6; i++) {
      await runSim(i);
      await sleep(3000); // pausa entre simulaciones
    }
    console.log('\n✅ Todas las simulaciones ejecutadas');
  } else {
    console.log('Uso:');
    console.log('  --status              Ver estado del worker');
    console.log('  --sim [N]            Ejecutar simulación N (1-6)');
    console.log('  --all                Ejecutar las 6 simulaciones');
    console.log('\nEjemplo: npx tsx scripts/test-baileys-inject.ts --sim 1');
  }
}

main().catch(err => { console.error(err); process.exit(1); });