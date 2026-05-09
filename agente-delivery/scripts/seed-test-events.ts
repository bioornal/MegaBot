#!/usr/bin/env tsx
// scripts/seed-test-events.ts — Llena Calendar con eventos test en mayo-junio 2026
// para stress-testing de la lógica de disponibilidad.
//
// Uso: npx tsx --env-file=.env.iguazufalls scripts/seed-test-events.ts
//
// Limpia primero todos los eventos test previos (mayo-junio 2026), luego siembra
// un set curado con solapamientos estratégicos.

process.env.TENANT_ID = 'iguazufalls';

import { fetchCabanas, type CabanaRow } from '../src/lib/catalog';
import { google } from 'googleapis';

interface SeedEvent {
  cabanaName: string;
  ci: string;            // YYYY-MM-DD
  co: string;            // YYYY-MM-DD
  guestName: string;
  personas: number;
  status: 'confirmed' | 'pending';
}

// Set de eventos diseñado para stress-testear:
// - Mayo 10-13: 2 cabañas ocupadas (1 Lodge, 1 Studio) — el resto libre
// - Mayo 22-28: 3 Lodges ocupados (fin de semana popular) — Timbó y Studios libres
// - Junio 1-4: 1 Studio + 1 Duplex ocupados
// - Junio 14-20: TODA LA SEMANA — 6 cabañas ocupadas (peak weekend)
// - Junio 25-30: solo Duplex Pitanga ocupado
const SEED_EVENTS: SeedEvent[] = [
  { cabanaName: 'Lodge Ambay',   ci: '2026-05-10', co: '2026-05-13', guestName: 'TEST Familia López',     personas: 4, status: 'confirmed' },
  { cabanaName: 'Studio Lapacho', ci: '2026-05-10', co: '2026-05-13', guestName: 'TEST Pareja Gomez',      personas: 2, status: 'confirmed' },

  { cabanaName: 'Lodge Palo Rosa', ci: '2026-05-22', co: '2026-05-28', guestName: 'TEST Grupo Martinez',  personas: 4, status: 'confirmed' },
  { cabanaName: 'Lodge Araucaria', ci: '2026-05-22', co: '2026-05-28', guestName: 'TEST Familia Ruiz',    personas: 4, status: 'confirmed' },
  { cabanaName: 'Lodge Guatambú',  ci: '2026-05-22', co: '2026-05-28', guestName: 'TEST Pareja Silva',    personas: 2, status: 'confirmed' },

  { cabanaName: 'Studio Guembe',  ci: '2026-06-01', co: '2026-06-04', guestName: 'TEST Pareja Acosta',   personas: 2, status: 'pending'   },
  { cabanaName: 'Duplex Cedro',   ci: '2026-06-01', co: '2026-06-04', guestName: 'TEST Familia Diaz',    personas: 5, status: 'confirmed' },

  // PEAK WEEKEND — 6 cabañas ocupadas el mismo rango (14-20 junio)
  { cabanaName: 'Lodge Ambay',     ci: '2026-06-14', co: '2026-06-20', guestName: 'TEST Familia Pérez',  personas: 4, status: 'confirmed' },
  { cabanaName: 'Lodge Palo Rosa', ci: '2026-06-14', co: '2026-06-20', guestName: 'TEST Grupo Sosa',     personas: 4, status: 'confirmed' },
  { cabanaName: 'Studio Lapacho',  ci: '2026-06-14', co: '2026-06-20', guestName: 'TEST Pareja Romero',  personas: 2, status: 'confirmed' },
  { cabanaName: 'Studio Guembe',   ci: '2026-06-14', co: '2026-06-20', guestName: 'TEST Pareja Castro',  personas: 2, status: 'confirmed' },
  { cabanaName: 'Duplex Laurel',   ci: '2026-06-14', co: '2026-06-20', guestName: 'TEST Familia Torres', personas: 6, status: 'confirmed' },
  { cabanaName: 'Duplex Ombú',     ci: '2026-06-14', co: '2026-06-20', guestName: 'TEST Familia Vega',   personas: 5, status: 'confirmed' },

  { cabanaName: 'Duplex Pitanga',  ci: '2026-06-25', co: '2026-06-30', guestName: 'TEST Familia Núñez',  personas: 5, status: 'confirmed' },
];

async function main() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  const cal = google.calendar({ version: 'v3', auth });
  const tz = process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/Argentina/Buenos_Aires';

  const cabanas = await fetchCabanas('products_iguazufalls');
  const byName = new Map<string, CabanaRow>();
  for (const c of cabanas) byName.set(c.nombre.toLowerCase(), c);

  // ── 1) Limpiar eventos test previos ──
  console.log('🧹 Limpiando eventos test previos en mayo-junio 2026...');
  let cleaned = 0;
  for (const cab of cabanas) {
    const res = await cal.events.list({
      calendarId: cab.calendar_id,
      timeMin: '2026-05-01T00:00:00Z',
      timeMax: '2026-06-30T23:59:59Z',
      singleEvents: true,
    });
    for (const ev of (res.data.items ?? [])) {
      try {
        await cal.events.delete({ calendarId: cab.calendar_id, eventId: ev.id! });
        cleaned++;
      } catch (e: any) {
        if (!String(e.message).includes('deleted') && e.code !== 410 && e.code !== 404) {
          console.error(`  ✗ Error borrando ${ev.id} de ${cab.nombre}: ${e.message}`);
        }
      }
    }
  }
  console.log(`✅ ${cleaned} evento(s) previo(s) borrado(s)\n`);

  // ── 2) Sembrar nuevos eventos ──
  console.log(`🌱 Sembrando ${SEED_EVENTS.length} evento(s) test...\n`);
  let seeded = 0;
  for (const ev of SEED_EVENTS) {
    const cab = byName.get(ev.cabanaName.toLowerCase());
    if (!cab) {
      console.error(`  ✗ Cabaña no encontrada en catálogo: "${ev.cabanaName}"`);
      continue;
    }
    const emoji = ev.status === 'confirmed' ? '✅' : '⏳';
    const label = ev.status === 'confirmed' ? 'CONFIRMADO' : 'PENDIENTE';
    const summary = `${emoji} ${label} — ${ev.guestName} (${ev.personas}p)`;
    const description = [
      `[SEED TEST EVENT — borrar antes de producción]`,
      `Cabaña: ${cab.nombre}`,
      `Personas: ${ev.personas}`,
      `Check-in: ${ev.ci} 14:00`,
      `Check-out: ${ev.co} 10:00`,
      `Estado seña: ${label}`,
    ].join('\n');

    try {
      const r = await cal.events.insert({
        calendarId: cab.calendar_id,
        requestBody: {
          summary,
          description,
          start: { dateTime: `${ev.ci}T14:00:00`, timeZone: tz },
          end:   { dateTime: `${ev.co}T10:00:00`, timeZone: tz },
        },
      });
      console.log(`  ✓ ${cab.nombre.padEnd(20)} ${ev.ci} → ${ev.co}  (${ev.guestName})`);
      seeded++;
    } catch (e: any) {
      console.error(`  ✗ Error creando en ${cab.nombre}: ${e.message}`);
    }
  }

  console.log(`\n✅ Seed completo: ${seeded}/${SEED_EVENTS.length} eventos creados.`);
  console.log('\n📊 Resumen de ocupación generada:');
  console.log('   - Mayo 10-13:    Lodge Ambay, Studio Lapacho ocupados (2/11)');
  console.log('   - Mayo 22-28:    3 Lodges ocupados (fin de semana popular)');
  console.log('   - Junio 1-4:     Studio Guembe, Duplex Cedro ocupados (2/11)');
  console.log('   - Junio 14-20:   PEAK — 6 cabañas ocupadas (solo 5 libres)');
  console.log('   - Junio 25-30:   Solo Duplex Pitanga ocupado (1/11)');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
