#!/usr/bin/env tsx
// Lista eventos de TODOS los calendarios de cabañas en 2030 (rango test) y opcionalmente los borra.
// Uso:
//   npx tsx --env-file=.env.iguazufalls scripts/list-test-events.ts          (solo lista)
//   npx tsx --env-file=.env.iguazufalls scripts/list-test-events.ts --delete (lista y borra)

process.env.TENANT_ID = 'iguazufalls';

import { fetchCabanas } from '../src/lib/catalog';
import { google } from 'googleapis';

async function main() {
  const shouldDelete = process.argv.includes('--delete');
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  const cal = google.calendar({ version: 'v3', auth });

  const cabanas = await fetchCabanas('products_iguazufalls');
  console.log(`🔍 Buscando eventos test (mayo-junio 2026) en ${cabanas.length} calendarios...\n`);

  let total = 0;
  let deleted = 0;
  for (const cab of cabanas) {
    const res = await cal.events.list({
      calendarId: cab.calendar_id,
      timeMin: '2026-05-01T00:00:00Z',
      timeMax: '2026-06-30T23:59:59Z',
      singleEvents: true,
    });
    const items = res.data.items ?? [];
    if (items.length === 0) continue;
    console.log(`📅 ${cab.nombre}: ${items.length} evento(s)`);
    for (const ev of items) {
      console.log(`   - ${ev.id}: "${ev.summary}" (${ev.start?.dateTime ?? ev.start?.date} → ${ev.end?.dateTime ?? ev.end?.date})`);
      total++;
      if (shouldDelete) {
        try {
          await cal.events.delete({ calendarId: cab.calendar_id, eventId: ev.id! });
          console.log(`     🗑️  borrado`);
          deleted++;
        } catch (e: any) {
          console.log(`     ✗ error: ${e.message}`);
        }
      }
    }
  }
  console.log(`\n✅ Total: ${total} evento(s) en mayo-junio 2026${shouldDelete ? ` | borrados: ${deleted}` : ''}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
