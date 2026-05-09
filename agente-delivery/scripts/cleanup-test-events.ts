#!/usr/bin/env tsx
// scripts/cleanup-test-events.ts — Borra todos los eventos de Calendar
// asociados a las conversaciones de test (phones 549110000XXXX@test.local).
//
// Uso: npx tsx --env-file=.env.iguazufalls scripts/cleanup-test-events.ts

process.env.TENANT_ID = 'iguazufalls';
process.env.DATA_DIR = process.env.DATA_DIR || './data/iguazufalls';

import { getDb } from '../src/lib/db';
import { deleteReservationEvent } from '../src/lib/calendar-gcal';

const db = getDb(process.env.DATA_DIR!);

async function main() {
  const all = db.listConversations();
  const testConvs = all.filter((c: any) => /^549110000\d{4}@test\.local$/.test(c.phone));
  console.log(`🔍 ${testConvs.length} conversaciones de test encontradas`);

  let cleaned = 0;
  for (const conv of testConvs) {
    const stateJson = db.getReservationState(conv.id);
    if (!stateJson) continue;
    try {
      const state = JSON.parse(stateJson);
      if (state.event_id && state.calendar_id) {
        try {
          await deleteReservationEvent(state.calendar_id, state.event_id);
          console.log(`✓ Borrado evento ${state.event_id} (${conv.phone}, ${state.cabana})`);
          cleaned++;
        } catch (e: any) {
          if (String(e.message).includes('deleted') || String(e.message).includes('Not Found') || e.code === 410 || e.code === 404) {
            console.log(`- Evento ${state.event_id} ya no existe (${conv.phone})`);
          } else {
            console.error(`✗ Error borrando ${state.event_id}: ${e.message}`);
          }
        }
      }
      db.setReservationState(conv.id, '');
      db.clearMessages(conv.id);
    } catch {}
  }

  console.log(`\n✅ Cleanup completo: ${cleaned} eventos borrados.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
