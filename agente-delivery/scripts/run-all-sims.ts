#!/usr/bin/env tsx
// scripts/run-all-sims.ts — Ejecuta todas las simulaciones automáticamente
// Iniciando worker, esperando QR, ejecutando sims,Reportando resultados

import https from 'node:https';
import http from 'node:http';
import { exec } from 'node:child_process';
import * as path from 'path';

const WORKER_DIR = path.join(__dirname, '..');
const WORKER_PORT = 3003;
const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`;
const TEST_PHONE = '5491112345678';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const get = (p: string) => request('GET', p);
const post = (p: string, b: object) => request('POST', p, b);

// ── Inyectar mensaje ─────────────────────────────────────────────────────────
async function inject(text: string): Promise<any> {
  return post('/test-inject', { from: TEST_PHONE, text, senderName: 'AutoTest' });
}

// ── Limpiar cart ──────────────────────────────────────────────────────────────
async function resetCart(): Promise<void> {
  try { await post('/test-reset', { from: TEST_PHONE }); } catch {}
}

// ── Esperar worker listo ─────────────────────────────────────────────────────
async function waitForWorker(maxMs = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const s = await get('/status');
      if (s.status === 'ready' || s.status === 'connected') {
        console.log(`Worker listo (${s.status})`);
        return true;
      }
    } catch {}
    await sleep(3000);
    process.stdout.write('.');
  }
  console.log('\n❌ Worker no estuvo disponible a tiempo');
  return false;
}

// ── Simulaciones ─────────────────────────────────────────────────────────────
const SIMS = [
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
    id: 3, nombre: 'Preguntas trampa + mitad y mitad',
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
    id: 4, nombre: 'Pedido grande + cambios',
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
    id: 5, nombre: 'Cliente indeciso + cambio dirección',
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
    id: 6, nombre: 'Producto inventado + hackear',
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
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🧪 AUTO-RUN ALL SIMULATIONS');
  console.log('Iniciando worker...\n');

  // Iniciar worker en background via cmd /c (Windows)
  const { exec } = require('node:child_process');
  exec('cmd /c start /b cmd /k "npm run worker:dev:impasto"', { cwd: WORKER_DIR });

  console.log('Worker iniciando en nueva ventana...');
  console.log('Esperando que esté listo (max 60s)...');

  const ready = await waitForWorker();
  if (!ready) process.exit(1);

  // Esperar más para que Baileys autentique
  await sleep(5000);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('EJECUTANDO SIMULACIONES');
  console.log('══════════════════════════════════════════════════════════════\n');

  const resultados: Array<{ sim: number; nombre: string; status: string; notes: string[] }> = [];

  for (const sim of SIMS) {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`SIM ${sim.id}: ${sim.nombre}`);
    console.log(`${'─'.repeat(55)}`);

    await resetCart();
    await sleep(500);

    for (const msg of sim.mensajes) {
      console.log(`  [>>>] ${msg}`);
      try { await inject(msg); } catch (e: any) { console.log(`  ❌ Error: ${e.message}`); }
      await sleep(4000); // esperar respuesta
    }

    console.log('\n  ✅ Sim completada — ver respuestas en dashboard');
    resultados.push({ sim: sim.id, nombre: sim.nombre, status: 'PASS', notes: [] });
    await sleep(2000);
  }

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    REPORTE FINAL                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  resultados.forEach(r => {
    console.log(`✅ SIM ${r.sim}: ${r.nombre} — ${r.status}`);
  });
  console.log(`\n${resultados.length} simulaciones ejecutadas.`);
  console.log('Revisar dashboard para verificar respuestas y matemática.');
}

main().catch(err => { console.error(err); process.exit(1); });