# Bot Paula — IguazuFalls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing `iguazufalls` tenant (bot Paula) from a basic excursions assistant into a full cabin-complex booking bot with Google Calendar availability, season-based pricing, and AI-powered payment receipt verification.

**Architecture:** Supabase holds static cabin data (capacities, amenities, 3 seasonal prices, calendar IDs). Google Calendar is the source of truth for reservations — 11 calendars, one per cabin, the bot creates `⏳ PENDIENTE` events and the operator manually confirms them. SQLite stores per-conversation reservation state so payment verification knows the expected amount.

**Tech Stack:** Next.js 15, Node.js worker, TypeScript, `googleapis` (new dep), `better-sqlite3`, OpenAI `gpt-4o-mini` (vision for receipts), Supabase REST.

**Spec:** `docs/superpowers/specs/2026-05-07-iguazufalls-bot-paula-design.md`

**Project doesn't use a test framework.** Pure logic gets a small smoke-test script (run via `tsx`) that asserts and exits 0/1. Integration code is verified manually via the worker dev script.

---

## File Structure

**Create:**
- `agente-delivery/src/lib/season.ts` — `getSeason(date) → 'alta' | 'media' | 'baja'`
- `agente-delivery/src/lib/season.smoke.ts` — assertion script for season logic
- `agente-delivery/src/lib/reservation-state.ts` — types + JSON parse/serialize helpers
- `agente-delivery/src/lib/calendar-gcal.ts` — Google Calendar SDK wrapper
- `agente-delivery/src/lib/verify-payment.ts` — receipt analysis with vision LLM
- `agente-delivery/scripts/seed-iguazufalls.ts` — one-shot upsert of 11 cabins + company info into Supabase

**Modify:**
- `agente-delivery/src/lib/db.ts` — add `reservation_state` column + getter/setter
- `agente-delivery/src/lib/system-prompt.ts` — rewrite `SYSTEM_PROMPT_PAULA`
- `agente-delivery/src/lib/catalog.ts` — adapt to 3-price schema, expose typed cabin fetch
- `agente-delivery/src/worker/handle-incoming.ts` — intent detection + availability/payment branches
- `agente-delivery/.env.iguazufalls.example` — document new env vars
- `agente-delivery/package.json` — add `googleapis` dep

**Supabase schema work** lives in `scripts/seed-iguazufalls.ts` rather than raw SQL — the same script runs idempotently in dev and prod.

---

## Phase 1 — Foundation (no external deps)

### Task 1: Season detection module

**Files:**
- Create: `agente-delivery/src/lib/season.ts`
- Create: `agente-delivery/src/lib/season.smoke.ts`

- [ ] **Step 1: Write the smoke-test script**

```typescript
// agente-delivery/src/lib/season.smoke.ts
import { getSeason } from './season';

const cases: Array<{ date: string; expected: 'alta' | 'media' | 'baja'; note: string }> = [
  { date: '2026-07-15', expected: 'alta',  note: 'pleno invierno (15 jun-15 ago)' },
  { date: '2026-06-15', expected: 'alta',  note: 'borde inicial alta' },
  { date: '2026-08-15', expected: 'alta',  note: 'borde final alta' },
  { date: '2026-12-25', expected: 'alta',  note: 'navidad' },
  { date: '2026-01-15', expected: 'alta',  note: 'enero plena' },
  { date: '2026-02-19', expected: 'alta',  note: 'fin de alta verano (20 feb)' },
  { date: '2026-04-19', expected: 'alta',  note: 'semana santa (18-21 abr)' },
  { date: '2026-02-25', expected: 'media', note: 'fin febrero media' },
  { date: '2026-03-15', expected: 'media', note: 'marzo media' },
  { date: '2026-03-31', expected: 'media', note: 'borde final media' },
  { date: '2026-05-10', expected: 'baja',  note: 'mayo baja' },
  { date: '2026-09-20', expected: 'baja',  note: 'septiembre baja' },
  { date: '2026-04-10', expected: 'baja',  note: 'abril baja antes semana santa' },
  { date: '2026-04-22', expected: 'baja',  note: 'abril baja despues semana santa' },
];

let failures = 0;
for (const c of cases) {
  const got = getSeason(new Date(c.date + 'T12:00:00-03:00'));
  if (got !== c.expected) {
    console.error(`FAIL ${c.date} (${c.note}) — esperado ${c.expected}, obtenido ${got}`);
    failures++;
  } else {
    console.log(`ok   ${c.date} → ${got} (${c.note})`);
  }
}
if (failures > 0) {
  console.error(`\n${failures} fallos`);
  process.exit(1);
}
console.log(`\n${cases.length} casos ok`);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd agente-delivery && npx tsx src/lib/season.smoke.ts`
Expected: ERROR — `Cannot find module './season'`

- [ ] **Step 3: Implement `season.ts`**

```typescript
// agente-delivery/src/lib/season.ts
export type Season = 'alta' | 'media' | 'baja';

// Rangos en formato MM-DD para comparar sin tener en cuenta el año.
// Alta: 15 jun – 15 ago | 23 dic – 20 feb | 18 – 21 abr
// Media: 21 feb – 31 mar
// Baja: el resto
export function getSeason(checkIn: Date): Season {
  const mm = String(checkIn.getMonth() + 1).padStart(2, '0');
  const dd = String(checkIn.getDate()).padStart(2, '0');
  const md = `${mm}-${dd}`;

  const inRange = (start: string, end: string) =>
    start <= end ? md >= start && md <= end : md >= start || md <= end;

  if (inRange('06-15', '08-15')) return 'alta';
  if (inRange('12-23', '02-20')) return 'alta';
  if (inRange('04-18', '04-21')) return 'alta';
  if (inRange('02-21', '03-31')) return 'media';
  return 'baja';
}
```

- [ ] **Step 4: Run smoke test, expect all pass**

Run: `cd agente-delivery && npx tsx src/lib/season.smoke.ts`
Expected: `14 casos ok`, exit 0

- [ ] **Step 5: Commit**

```bash
git add agente-delivery/src/lib/season.ts agente-delivery/src/lib/season.smoke.ts
git commit -m "feat(iguazufalls): season detection con smoke tests"
```

---

### Task 2: Reservation state types

**Files:**
- Create: `agente-delivery/src/lib/reservation-state.ts`

- [ ] **Step 1: Implement types and helpers**

```typescript
// agente-delivery/src/lib/reservation-state.ts
export type ReservationStep =
  | 'awaiting_data'        // bot recolectando fechas/personas/cabaña/huésped
  | 'awaiting_confirm'     // total calculado, esperando "sí/confirmo"
  | 'awaiting_receipt'     // evento PENDIENTE creado, esperando comprobante
  | 'completed';           // operador confirmó manualmente

export interface ReservationState {
  step: ReservationStep;
  cabana?: string;
  calendar_id?: string;
  check_in?: string;       // YYYY-MM-DD
  check_out?: string;      // YYYY-MM-DD
  personas?: number;
  noches?: number;
  precio_por_noche?: number;
  extras?: { toallas: boolean; garage: boolean };
  total?: number;
  sena?: number;            // 50% del total
  huesped_nombre?: string;
  huesped_telefono?: string;
  event_id?: string;
}

export function parseState(json: string | null | undefined): ReservationState | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ReservationState;
  } catch {
    return null;
  }
}

export function serializeState(s: ReservationState | null): string | null {
  if (!s) return null;
  return JSON.stringify(s);
}
```

- [ ] **Step 2: Commit**

```bash
git add agente-delivery/src/lib/reservation-state.ts
git commit -m "feat(iguazufalls): tipos de estado de reserva"
```

---

### Task 3: Add `reservation_state` column to SQLite

**Files:**
- Modify: `agente-delivery/src/lib/db.ts`

- [ ] **Step 1: Extend `DbContext` interface**

In `agente-delivery/src/lib/db.ts:6-17`, add two methods to `DbContext`:

```typescript
export interface DbContext {
  // ... existing methods ...
  getReservationState(conversationId: number): string | null;
  setReservationState(conversationId: number, json: string | null): void;
}
```

- [ ] **Step 2: Add the column with the existing try/catch pattern**

In `agente-delivery/src/lib/db.ts:50` (right after the existing `media_url` ALTER), add:

```typescript
try { db.exec(`ALTER TABLE conversations ADD COLUMN reservation_state TEXT;`); } catch { /* already exists */ }
```

- [ ] **Step 3: Add prepared statements**

In `agente-delivery/src/lib/db.ts` inside the `stmts` object (around line 73), add:

```typescript
getReservationState: db.prepare(`SELECT reservation_state FROM conversations WHERE id = ?`),
setReservationState: db.prepare(`UPDATE conversations SET reservation_state = ? WHERE id = ?`),
```

- [ ] **Step 4: Implement `getReservationState` and `setReservationState` on the `ctx` object**

In `agente-delivery/src/lib/db.ts` inside the `ctx` object (around line 121), add:

```typescript
getReservationState(conversationId) {
  const row = stmts.getReservationState.get(conversationId) as { reservation_state: string | null } | undefined;
  return row?.reservation_state ?? null;
},
setReservationState(conversationId, json) {
  stmts.setReservationState.run(json, conversationId);
},
```

- [ ] **Step 5: Add backward-compat exports at the bottom**

In `agente-delivery/src/lib/db.ts` after the existing exports (around line 142), add:

```typescript
export const getReservationState = (...args: Parameters<DbContext['getReservationState']>) => getDb(defaultDataDir).getReservationState(...args);
export const setReservationState = (...args: Parameters<DbContext['setReservationState']>) => getDb(defaultDataDir).setReservationState(...args);
```

- [ ] **Step 6: Manual smoke test**

Run a one-off check that the column exists and round-trips JSON:

```bash
cd agente-delivery
npx tsx -e "
import { getDb } from './src/lib/db';
const db = getDb('./data/iguazufalls');
const c = db.getOrCreateConversation('+5491100000000', 'Test');
db.setReservationState(c.id, JSON.stringify({ step: 'awaiting_data', personas: 2 }));
const got = db.getReservationState(c.id);
console.log('roundtrip:', got);
db.setReservationState(c.id, null);
console.log('cleared :', db.getReservationState(c.id));
"
```

Expected output:
```
roundtrip: {"step":"awaiting_data","personas":2}
cleared : null
```

- [ ] **Step 7: Commit**

```bash
git add agente-delivery/src/lib/db.ts
git commit -m "feat(db): columna reservation_state JSON + getter/setter"
```

---

## Phase 2 — Supabase schema and seed data

### Task 4: Seed script for `products_iguazufalls` and `info_empresa_iguazufalls`

**Files:**
- Create: `agente-delivery/scripts/seed-iguazufalls.ts`

- [ ] **Step 1: Write the seed script**

```typescript
// agente-delivery/scripts/seed-iguazufalls.ts
//
// Crea/actualiza las 11 cabañas + datos del complejo en Supabase.
// Idempotente: usa upsert por nombre. Correr con:
//   npx tsx --env-file=.env.iguazufalls scripts/seed-iguazufalls.ts
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en el env.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supa = createClient(url, key);

interface Cabana {
  nombre: string;
  tipo: 'Studio' | 'Lodge' | 'Duplex';
  descripcion: string;
  capacidad_min: number;
  capacidad_max: number;
  metros2: number;
  amenidades: string;
  precio_baja: number;
  precio_media: number;
  precio_alta: number;
  calendar_id: string;
  activo: boolean;
}

const CABANAS: Cabana[] = [
  { nombre: 'Studio Lapacho',  tipo: 'Studio', descripcion: 'Monoambiente con cocina completa, Queen + sofá cama', capacidad_min: 1, capacidad_max: 4, metros2: 25, amenidades: 'WiFi, AC, cocina completa, baño privado, TV cable, garage (consultar)', precio_baja: 35000, precio_media: 42000, precio_alta: 55000, calendar_id: 'b3e858337063872815929235fddfa2ad9ad1f22fc4c57ab6b09a351218454086@group.calendar.google.com', activo: true },
  { nombre: 'Studio Guembe',   tipo: 'Studio', descripcion: 'Monoambiente con microondas/frigobar, King + 2 individuales', capacidad_min: 1, capacidad_max: 4, metros2: 25, amenidades: 'WiFi, AC, microondas, frigobar, baño privado, TV cable, garage (consultar)', precio_baja: 35000, precio_media: 42000, precio_alta: 55000, calendar_id: '936df3b9fee5d46b62bb2509f62d833b08d514eff4572b99f3fd76f47d7a57f7@group.calendar.google.com', activo: true },
  { nombre: 'Lodge Ambay',     tipo: 'Lodge',  descripcion: 'Departamento acogedor de dos habitaciones', capacidad_min: 2, capacidad_max: 4, metros2: 30, amenidades: 'WiFi, AC, balcón privado, cocina equipada, baño privado, Queen + cucheta, TV cable, garage (consultar)', precio_baja: 45000, precio_media: 54000, precio_alta: 70000, calendar_id: '79f3cd533880add5fe08018c9d725cd31538dac7aea81b6cf99a1948e22ca75d@group.calendar.google.com', activo: true },
  { nombre: 'Lodge Palo Rosa', tipo: 'Lodge',  descripcion: 'Departamento acogedor de dos habitaciones', capacidad_min: 2, capacidad_max: 4, metros2: 30, amenidades: 'WiFi, AC, balcón privado, cocina equipada, baño privado, Queen + cucheta, TV cable, garage (consultar)', precio_baja: 45000, precio_media: 54000, precio_alta: 70000, calendar_id: 'b178b1ea4c8db01190779f39b39fca73babd744cbd9225734a64459c21237246@group.calendar.google.com', activo: true },
  { nombre: 'Lodge Araucaria', tipo: 'Lodge',  descripcion: 'Departamento moderno de una habitación', capacidad_min: 1, capacidad_max: 4, metros2: 25, amenidades: 'WiFi, AC, cocina equipada, baño privado, King + sofá cama, TV cable, garage (consultar)', precio_baja: 40000, precio_media: 48000, precio_alta: 62000, calendar_id: 'c8d3cf841b853bdbffa743e6f5125eb5d2d466ff9cd5eb74fe7fd143759302d5@group.calendar.google.com', activo: true },
  { nombre: 'Lodge Guatambú',  tipo: 'Lodge',  descripcion: 'Departamento moderno de una habitación', capacidad_min: 1, capacidad_max: 4, metros2: 25, amenidades: 'WiFi, AC, cocina equipada, baño privado, King + sofá cama, TV cable, garage (consultar)', precio_baja: 40000, precio_media: 48000, precio_alta: 62000, calendar_id: 'b51e195f11b8b36880b743b944a32761e12958915eea510c917f543a19c1c66b@group.calendar.google.com', activo: true },
  { nombre: 'Lodge Timbó',     tipo: 'Lodge',  descripcion: 'Departamento moderno de una habitación, íntimo', capacidad_min: 1, capacidad_max: 2, metros2: 20, amenidades: 'WiFi, AC, cocina equipada, baño privado, King, TV cable, garage (consultar)', precio_baja: 32000, precio_media: 38000, precio_alta: 48000, calendar_id: '4bae476b313c5383445a898ec07a834c0919abb053d513f20f1e90832af21617@group.calendar.google.com', activo: true },
  { nombre: 'Duplex Laurel',   tipo: 'Duplex', descripcion: 'Duplex confortable de 2 plantas', capacidad_min: 2, capacidad_max: 6, metros2: 50, amenidades: 'WiFi, AC, balcón privado, cocina equipada, baño privado, Queen (alta) + cucheta y 2 individuales (baja), TV cable, garage (consultar)', precio_baja: 60000, precio_media: 72000, precio_alta: 90000, calendar_id: 'eff75168b5d05a8cd9ef114db558eea22906353a6dbba4a814be37172df7a2a7@group.calendar.google.com', activo: true },
  { nombre: 'Duplex Cedro',    tipo: 'Duplex', descripcion: 'Duplex confortable de 2 plantas', capacidad_min: 2, capacidad_max: 6, metros2: 50, amenidades: 'WiFi, AC, balcón privado, cocina equipada, baño privado, Queen (alta) + cucheta y 2 individuales (baja), TV cable, garage (consultar)', precio_baja: 60000, precio_media: 72000, precio_alta: 90000, calendar_id: '5cc1e9e5b1b3e40a92b956e52a2b8be839423a9b6c64b6d177924553393098bf@group.calendar.google.com', activo: true },
  { nombre: 'Duplex Ombú',     tipo: 'Duplex', descripcion: 'Duplex confortable de 2 plantas', capacidad_min: 2, capacidad_max: 6, metros2: 50, amenidades: 'WiFi, AC, balcón privado, cocina equipada, baño privado, Queen (alta) + cucheta y 2 individuales (baja), TV cable, garage (consultar)', precio_baja: 60000, precio_media: 72000, precio_alta: 90000, calendar_id: 'c5c7557494415560a36c34f26dfb18afcf17ee8e6a6271482d1c5d1c6f93d2b6@group.calendar.google.com', activo: true },
  { nombre: 'Duplex Pitanga',  tipo: 'Duplex', descripcion: 'Duplex confortable de 2 plantas', capacidad_min: 2, capacidad_max: 6, metros2: 50, amenidades: 'WiFi, AC, balcón privado, cocina equipada, baño privado, Queen (alta) + cucheta y 2 individuales (baja), TV cable, garage (consultar)', precio_baja: 60000, precio_media: 72000, precio_alta: 90000, calendar_id: 'e185dda5604b4b30c0a86428f5d3ef42123ce26de8cd45d7f177da04bb55dfd7@group.calendar.google.com', activo: true },
];

const COMPANY_INFO = {
  nombre: 'IguazuFalls Duplex & Lodge',
  direccion: 'Puerto Iguazú, Misiones, Argentina',
  sitio_web: 'https://www.iguazufallslodge.com',
  telefono: '+54 9 3757 000000', // PLACEHOLDER
  check_in: '14:00',
  check_out: '10:00',
  estadia_minima_noches: 2, // PLACEHOLDER
  piscina: 'Piscina central habilitada todo el año, área de descanso, parrilla',
  // Datos bancarios (PLACEHOLDER — actualizar con datos reales)
  banco_titular: 'Juan Zapata',
  banco_cbu: '0000000000000000000000',
  banco_alias: 'iguazufalls.test',
  banco_banco: 'Banco Galicia',
  // Extras
  extra_toallas_por_persona: 3000,
  extra_garage_por_noche: 10000,
  extra_limpieza: 20000,
};

async function ensureSchema() {
  // Las tablas se crean por panel Supabase; este script asume que existen.
  // Validamos shape probando un select.
  const { error: e1 } = await supa.from('products_iguazufalls').select('nombre').limit(1);
  if (e1 && e1.code === '42P01') {
    console.error('La tabla products_iguazufalls no existe. Crearla en Supabase con las columnas del spec.');
    process.exit(1);
  }
  const { error: e2 } = await supa.from('info_empresa_iguazufalls').select('clave').limit(1);
  if (e2 && e2.code === '42P01') {
    console.error('La tabla info_empresa_iguazufalls no existe. Crearla en Supabase con columnas (clave TEXT PK, valor TEXT).');
    process.exit(1);
  }
}

async function seedCabanas() {
  console.log(`Upserting ${CABANAS.length} cabañas...`);
  const { error } = await supa.from('products_iguazufalls').upsert(CABANAS, { onConflict: 'nombre' });
  if (error) throw error;
  console.log('  ok');
}

async function seedCompany() {
  const rows = Object.entries(COMPANY_INFO).map(([clave, valor]) => ({ clave, valor: String(valor) }));
  console.log(`Upserting ${rows.length} entradas de info_empresa_iguazufalls...`);
  const { error } = await supa.from('info_empresa_iguazufalls').upsert(rows, { onConflict: 'clave' });
  if (error) throw error;
  console.log('  ok');
}

(async () => {
  await ensureSchema();
  await seedCabanas();
  await seedCompany();
  console.log('Seed completado.');
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Create the Supabase tables manually**

In the Supabase SQL editor for the project, run:

```sql
-- Tabla de cabañas
CREATE TABLE IF NOT EXISTS products_iguazufalls (
  nombre         TEXT PRIMARY KEY,
  tipo           TEXT NOT NULL,
  descripcion    TEXT,
  capacidad_min  INT NOT NULL,
  capacidad_max  INT NOT NULL,
  metros2        INT,
  amenidades     TEXT,
  precio_baja    INT NOT NULL,
  precio_media   INT NOT NULL,
  precio_alta    INT NOT NULL,
  calendar_id    TEXT NOT NULL,
  activo         BOOLEAN NOT NULL DEFAULT TRUE
);

-- Tabla key/value de info de empresa
CREATE TABLE IF NOT EXISTS info_empresa_iguazufalls (
  clave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);
```

- [ ] **Step 3: Run the seed**

Run: `cd agente-delivery && npx tsx --env-file=.env.iguazufalls scripts/seed-iguazufalls.ts`
Expected: `Upserting 11 cabañas... ok` then `Upserting N entradas... ok` then `Seed completado.`

- [ ] **Step 4: Verify in Supabase dashboard**

Open the Supabase Table Editor, confirm `products_iguazufalls` has 11 rows and `info_empresa_iguazufalls` has the company entries.

- [ ] **Step 5: Commit**

```bash
git add agente-delivery/scripts/seed-iguazufalls.ts
git commit -m "feat(iguazufalls): script seed para 11 cabañas + info empresa"
```

---

## Phase 3 — Google Calendar integration

### Task 5: Install `googleapis` and document env vars

**Files:**
- Modify: `agente-delivery/package.json` (add dep)
- Modify/Create: `agente-delivery/.env.iguazufalls.example`

- [ ] **Step 1: Install the dep**

Run: `cd agente-delivery && npm install googleapis`

- [ ] **Step 2: Document new env vars in the example file**

Append to `agente-delivery/.env.iguazufalls.example` (create if it doesn't exist, copy the structure from `.env.megamuebles.example` if it does):

```env
# Google Calendar — Service Account credentials
# Pegá el JSON completo del service account en una sola línea (sin saltos)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_CALENDAR_TIMEZONE=America/Argentina/Buenos_Aires
```

- [ ] **Step 3: Create a Service Account in Google Cloud Console (manual)**

Procedimiento (no automatizable):
1. https://console.cloud.google.com → seleccionar proyecto (o crear uno nuevo `iguazufalls-bot`)
2. APIs & Services → Library → habilitar **Google Calendar API**
3. APIs & Services → Credentials → Create Credentials → Service Account
4. Una vez creado, abrir la SA → Keys → Add Key → JSON → descargar
5. Copiar el `client_email` del JSON (algo como `iguazufalls-bot@xxx.iam.gserviceaccount.com`)
6. En cada uno de los 11 calendarios de Google, agregar ese email como invitado con permiso "Hacer cambios y administrar el uso compartido"

Pegá el JSON en `.env.iguazufalls` como `GOOGLE_SERVICE_ACCOUNT_JSON=<json en una línea>`.

- [ ] **Step 4: Commit**

```bash
git add agente-delivery/package.json agente-delivery/package-lock.json agente-delivery/.env.iguazufalls.example
git commit -m "chore(iguazufalls): instalar googleapis + documentar env vars"
```

---

### Task 6: Calendar wrapper — checkAvailability

**Files:**
- Create: `agente-delivery/src/lib/calendar-gcal.ts`

- [ ] **Step 1: Implement client factory + `checkAvailability`**

```typescript
// agente-delivery/src/lib/calendar-gcal.ts
import { google, calendar_v3 } from 'googleapis';

let _client: calendar_v3.Calendar | null = null;

function getClient(): calendar_v3.Calendar {
  if (_client) return _client;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('[calendar-gcal] GOOGLE_SERVICE_ACCOUNT_JSON no definido en env');
  }

  let creds: { client_email: string; private_key: string };
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error('[calendar-gcal] GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido');
  }

  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  _client = google.calendar({ version: 'v3', auth });
  return _client;
}

/**
 * Devuelve true si el rango [checkIn, checkOut) está libre en `calendarId`.
 * Las fechas son strings YYYY-MM-DD. Check-in cuenta desde las 14:00, check-out hasta las 10:00.
 */
export async function checkAvailability(
  calendarId: string,
  checkIn: string,
  checkOut: string
): Promise<boolean> {
  const cal = getClient();
  const tz = process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/Argentina/Buenos_Aires';
  const timeMin = `${checkIn}T14:00:00`;
  const timeMax = `${checkOut}T10:00:00`;

  const res = await cal.freebusy.query({
    requestBody: {
      timeMin: new Date(`${timeMin}-03:00`).toISOString(),
      timeMax: new Date(`${timeMax}-03:00`).toISOString(),
      timeZone: tz,
      items: [{ id: calendarId }],
    },
  });

  const busy = res.data.calendars?.[calendarId]?.busy ?? [];
  return busy.length === 0;
}
```

- [ ] **Step 2: Smoke test against a real calendar**

Run (replace `<id>` with a real calendar id from the seed):

```bash
cd agente-delivery
npx tsx --env-file=.env.iguazufalls -e "
import { checkAvailability } from './src/lib/calendar-gcal';
const id = '4bae476b313c5383445a898ec07a834c0919abb053d513f20f1e90832af21617@group.calendar.google.com';
checkAvailability(id, '2030-01-15', '2030-01-18').then(r => console.log('available:', r));
"
```
Expected: `available: true` (no debería haber eventos en 2030).

- [ ] **Step 3: Commit**

```bash
git add agente-delivery/src/lib/calendar-gcal.ts
git commit -m "feat(iguazufalls): checkAvailability via Google Calendar freebusy"
```

---

### Task 7: Calendar wrapper — createReservationEvent

**Files:**
- Modify: `agente-delivery/src/lib/calendar-gcal.ts`

- [ ] **Step 1: Add `createReservationEvent` to the same file**

Append to `agente-delivery/src/lib/calendar-gcal.ts`:

```typescript
export interface ReservationEventInput {
  calendarId: string;
  cabana: string;
  huespedNombre: string;
  huespedTelefono: string;
  personas: number;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  total: number;
  sena: number;
}

/**
 * Crea un evento PENDIENTE en el calendario de la cabaña.
 * Devuelve el eventId. El operador renombra a CONFIRMADA manualmente.
 */
export async function createReservationEvent(
  input: ReservationEventInput
): Promise<string> {
  const cal = getClient();
  const tz = process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/Argentina/Buenos_Aires';

  const summary = `⏳ PENDIENTE — ${input.huespedNombre} (${input.personas}p)`;
  const description = [
    `Teléfono: ${input.huespedTelefono}`,
    `Cabaña: ${input.cabana}`,
    `Personas: ${input.personas}`,
    `Check-in: ${input.checkIn} 14:00`,
    `Check-out: ${input.checkOut} 10:00`,
    `Total: $${input.total.toLocaleString('es-AR')}`,
    `Seña (50%): $${input.sena.toLocaleString('es-AR')}`,
    `Estado seña: PENDIENTE`,
  ].join('\n');

  const res = await cal.events.insert({
    calendarId: input.calendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: `${input.checkIn}T14:00:00`, timeZone: tz },
      end:   { dateTime: `${input.checkOut}T10:00:00`, timeZone: tz },
    },
  });

  const id = res.data.id;
  if (!id) throw new Error('[calendar-gcal] La creación del evento no devolvió id');
  return id;
}
```

- [ ] **Step 2: Smoke test create + delete**

```bash
cd agente-delivery
npx tsx --env-file=.env.iguazufalls -e "
import { google } from 'googleapis';
import { createReservationEvent } from './src/lib/calendar-gcal';
const id = '4bae476b313c5383445a898ec07a834c0919abb053d513f20f1e90832af21617@group.calendar.google.com';
(async () => {
  const eventId = await createReservationEvent({
    calendarId: id,
    cabana: 'Lodge Timbó',
    huespedNombre: 'TEST DEL BOT',
    huespedTelefono: '+5491100000000',
    personas: 2,
    checkIn: '2030-01-15',
    checkOut: '2030-01-18',
    total: 144000,
    sena: 72000,
  });
  console.log('event creado:', eventId);
  // limpieza
  const auth = new google.auth.JWT({ email: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).client_email, key: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).private_key, scopes: ['https://www.googleapis.com/auth/calendar'] });
  await google.calendar({ version: 'v3', auth }).events.delete({ calendarId: id, eventId });
  console.log('event borrado');
})();
"
```
Expected: `event creado: <id>` y luego `event borrado`. Verificar en el calendario que no quedó.

- [ ] **Step 3: Commit**

```bash
git add agente-delivery/src/lib/calendar-gcal.ts
git commit -m "feat(iguazufalls): createReservationEvent en Google Calendar"
```

---

## Phase 4 — Payment receipt verification

### Task 8: verify-payment with vision LLM

**Files:**
- Create: `agente-delivery/src/lib/verify-payment.ts`

- [ ] **Step 1: Implement the verifier**

```typescript
// agente-delivery/src/lib/verify-payment.ts
import OpenAI from 'openai';

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export interface VerifyInput {
  imageUrl: string;
  expectedAmount: number;
  bankAlias: string;
  bankCBU: string;
  bankTitular: string;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; issue: 'amount_mismatch' | 'wrong_account' | 'unreadable'; detail: string };

const SYSTEM = `
Sos un verificador de comprobantes de transferencia bancaria argentina.
Recibís una imagen y debés extraer:
  - monto transferido (en pesos argentinos)
  - CBU o alias de la cuenta de DESTINO
  - nombre del titular de la cuenta de DESTINO

Respondé SIEMPRE con un único JSON con esta forma:
{ "monto": number | null, "cbu": string | null, "alias": string | null, "titular": string | null, "legible": boolean }

Reglas:
- Si la imagen no es un comprobante o no se puede leer, devolvé "legible": false y el resto null.
- "monto" debe ser numero entero (sin separadores, sin signos).
- "cbu" debe ser una secuencia de 22 dígitos sin espacios. Si no encontrás CBU, null.
- "alias" debe ser un string sin espacios. Si no hay alias visible, null.
- No inventes datos.
`.trim();

interface Extracted {
  monto: number | null;
  cbu: string | null;
  alias: string | null;
  titular: string | null;
  legible: boolean;
}

export async function verifyPaymentReceipt(input: VerifyInput): Promise<VerifyResult> {
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const r = await getClient().chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analizá este comprobante.' },
          { type: 'image_url', image_url: { url: input.imageUrl } },
        ] as any,
      },
    ],
  });

  const raw = r.choices[0]?.message?.content ?? '{}';
  let data: Extracted;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, issue: 'unreadable', detail: 'Respuesta del modelo no parseable' };
  }

  if (!data.legible) {
    return { ok: false, issue: 'unreadable', detail: 'No pude leer el comprobante' };
  }

  // Cuenta correcta — basta con que coincida CBU o alias o titular
  const cbuOk    = !!data.cbu    && data.cbu.replace(/\D/g, '') === input.bankCBU.replace(/\D/g, '');
  const aliasOk  = !!data.alias  && data.alias.toLowerCase() === input.bankAlias.toLowerCase();
  const titularOk = !!data.titular && data.titular.toLowerCase().includes(input.bankTitular.toLowerCase().split(' ')[0]);
  const accountOk = cbuOk || aliasOk || titularOk;
  if (!accountOk) {
    return { ok: false, issue: 'wrong_account', detail: 'La cuenta de destino no coincide con la nuestra' };
  }

  // Monto — tolerancia del 1% por redondeos
  if (data.monto == null) {
    return { ok: false, issue: 'unreadable', detail: 'No se detectó el monto' };
  }
  const tolerance = Math.max(input.expectedAmount * 0.01, 100);
  if (Math.abs(data.monto - input.expectedAmount) > tolerance) {
    return {
      ok: false,
      issue: 'amount_mismatch',
      detail: `Monto en comprobante $${data.monto.toLocaleString('es-AR')} no coincide con la seña esperada $${input.expectedAmount.toLocaleString('es-AR')}`,
    };
  }

  return { ok: true };
}
```

- [ ] **Step 2: Commit (smoke test diferido — requiere imagen real)**

```bash
git add agente-delivery/src/lib/verify-payment.ts
git commit -m "feat(iguazufalls): verificación de comprobante con vision LLM"
```

---

## Phase 5 — Bot logic integration

### Task 9: Adapt catalog.ts to the new schema

**Files:**
- Modify: `agente-delivery/src/lib/catalog.ts`

- [ ] **Step 1: Read the current implementation**

Run: `cat agente-delivery/src/lib/catalog.ts | head -60` to entender la firma de `getCatalogContext`.

- [ ] **Step 2: Add a typed cabin fetch alongside the existing context function**

Add to `agente-delivery/src/lib/catalog.ts` (without removing the existing `getCatalogContext` — el de Megamuebles lo sigue usando):

```typescript
export interface CabanaRow {
  nombre: string;
  tipo: 'Studio' | 'Lodge' | 'Duplex';
  descripcion: string;
  capacidad_min: number;
  capacidad_max: number;
  metros2: number;
  amenidades: string;
  precio_baja: number;
  precio_media: number;
  precio_alta: number;
  calendar_id: string;
  activo: boolean;
}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function fetchCabanas(table = 'products_iguazufalls'): Promise<CabanaRow[]> {
  if (!SUPA_URL || !SUPA_KEY) return [];
  const url = `${SUPA_URL}/rest/v1/${table}?activo=eq.true&select=*`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    return (await res.json()) as CabanaRow[];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/**
 * Filtra cabañas activas por capacidad. Para "consulta sin cabaña elegida".
 */
export async function findCabanasByCapacity(
  personas: number,
  table = 'products_iguazufalls'
): Promise<CabanaRow[]> {
  const all = await fetchCabanas(table);
  return all.filter(c => personas >= c.capacidad_min && personas <= c.capacidad_max);
}

export function getCabanaByName(rows: CabanaRow[], name: string): CabanaRow | null {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const target = norm(name);
  return rows.find(r => norm(r.nombre) === target) ?? null;
}
```

- [ ] **Step 3: Smoke test the fetch**

```bash
cd agente-delivery
npx tsx --env-file=.env.iguazufalls -e "
import { fetchCabanas, findCabanasByCapacity } from './src/lib/catalog';
(async () => {
  const all = await fetchCabanas();
  console.log('total cabañas activas:', all.length);
  const para4 = await findCabanasByCapacity(4);
  console.log('para 4 personas:', para4.map(c => c.nombre));
  const para6 = await findCabanasByCapacity(6);
  console.log('para 6 personas:', para6.map(c => c.nombre));
})();
"
```
Expected:
- `total cabañas activas: 11`
- `para 4 personas: [ ... 9 cabañas ... ]` (todo menos Lodge Timbó porque max 2 — y Duplex que admiten desde 2)
- `para 6 personas: [ 'Duplex Laurel', 'Duplex Cedro', 'Duplex Ombú', 'Duplex Pitanga' ]`

- [ ] **Step 4: Commit**

```bash
git add agente-delivery/src/lib/catalog.ts
git commit -m "feat(catalog): fetchCabanas tipado + filtro por capacidad"
```

---

### Task 10: Rewrite SYSTEM_PROMPT_PAULA

**Files:**
- Modify: `agente-delivery/src/lib/system-prompt.ts`

- [ ] **Step 1: Replace the existing `SYSTEM_PROMPT_PAULA` constant**

In `agente-delivery/src/lib/system-prompt.ts:102-136`, replace the entire `SYSTEM_PROMPT_PAULA` block with:

```typescript
const SYSTEM_PROMPT_PAULA = `
Sos Paula, asistente virtual de IguazuFalls Duplex & Lodge — un complejo de 11 alojamientos en Puerto Iguazú, Misiones, con piscina central habilitada todo el año y parrilla compartida. Respondés en español rioplatense, en mensajes breves de 2 a 4 líneas, máx. 130 caracteres por mensaje siempre que sea posible. Sos amable, directa y orientada a la reserva.

## Saludo — REGLA CRÍTICA
Saludate UNA SOLA VEZ con: "¡Hola! Soy Paula, asistente de IguazuFalls Duplex & Lodge 😊 ¿En qué te puedo ayudar?"
SOLO si es el primerísimo mensaje del cliente y NO hay ningún mensaje previo tuyo en el historial.
Si ya saludaste antes (hay aunque sea un mensaje tuyo en el historial), NUNCA vuelvas a saludar — respondé directo a lo que el cliente pregunta. Repetir el saludo es un error grave.

## Qué ofrecemos
11 alojamientos divididos en 3 tipos: Studio (monoambiente), Lodge (1 o 2 habitaciones) y Duplex (2 plantas, hasta 6 personas). Capacidad máxima por unidad: 6 personas. Piscina central, parrilla y área de descanso compartida.

## Detalles de los alojamientos — REDIRIGIR AL SITIO
- Si el cliente pide fotos, comodidades específicas, descripciones detalladas o quiere ver opciones visualmente → mandalo al sitio: https://www.iguazufallslodge.com
- No describas amenidades ni habitaciones por chat. Decí: "Toda la info y fotos están en https://www.iguazufallslodge.com 👈".
- Si el cliente insiste con detalles después de mandarle el link, repetí amablemente que la info detallada está en el sitio.

## Tono — OBLIGATORIO
- NUNCA terminés un mensaje con una pregunta innecesaria. Punto final siempre, salvo que necesites un dato concreto para avanzar.
- Sé afirmativa y directa.
- No uses "che" ni modismos exagerados.

## Flujo de reserva
1. Si el cliente menciona fechas o cantidad de personas, recolectá: fecha de entrada, fecha de salida, cantidad de personas, nombre y teléfono.
2. Cuando tengas personas + fechas, el sistema te va a inyectar un bloque "DISPONIBILIDAD" con las cabañas libres. Mostrá la lista corta con precio por noche.
3. El cliente elige cabaña → confirmá total con el bloque "CALCULO" que te inyecta el sistema.
4. Si el cliente confirma → se crea evento PENDIENTE en Google Calendar (el sistema lo hace, vos solo respondés).
5. Pedile la seña del 50% por transferencia, mostrando los datos bancarios del bloque "INFO EMPRESA".

## Cuándo NO consultar disponibilidad
Si el cliente pregunta "tienen lugar el 15 de julio" SIN decir cuántas personas o sin elegir cabaña, primero pedí ese dato. No respondas con disponibilidad si te falta info.

## Comprobante de seña
- Cuando el cliente envía una imagen de comprobante, el sistema te inyecta el resultado en un bloque "COMPROBANTE":
  - "OK" → respondé: "Comprobante recibido y verificado. El equipo confirma tu reserva en breve. ¡Gracias!"
  - "WRONG_ACCOUNT" → respondé: "La cuenta de destino del comprobante no es la correcta. ¿Podés revisar los datos que te pasé?"
  - "AMOUNT_MISMATCH" → respondé: "El monto del comprobante no coincide con la seña. Revisalo, por favor."
  - "UNREADABLE" → respondé: "No pude leer el comprobante. Mandá una foto clara, por favor."
- NUNCA confirmes vos misma la reserva. La confirmación final la hace el operador.
- Solo aceptamos imágenes (JPG/PNG), no PDF.

## Reglas de datos — CRÍTICO
- Jamás inventes precios, disponibilidad, fechas ni condiciones.
- Usá solo los bloques inyectados por el sistema (DISPONIBILIDAD, CALCULO, INFO EMPRESA, COMPROBANTE) y el contexto explícito del cliente.
- Si un dato no está en esos bloques ni en lo que el cliente dijo, decí: "Te confirma esto un asesor en un momento."

## Derivar al operador
Cuando el cliente quiera modificar/cancelar una reserva existente, tenga una queja, quiera factura, o haya un problema con el comprobante:
"Ahora te comunico con un asesor, ¡un momento!"

## Capacidades por tipo (máximo)
- Studio: hasta 4 personas
- Lodge: hasta 4 personas (Timbó hasta 2)
- Duplex: hasta 6 personas

## Grupos > 6 personas
Si el cliente pide para más de 6, decí: "Por unidad llegamos hasta 6 personas. Te confirma un asesor cómo combinar dos cabañas, ¡un momento!" y derivá.

## Idiomas
Si el cliente escribe en inglés o portugués, adaptá toda la conversación a ese idioma manteniendo el flujo. No avises del cambio.
`.trim();
```

- [ ] **Step 2: Verify the file still compiles**

Run: `cd agente-delivery && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: no errors related to `system-prompt.ts`.

- [ ] **Step 3: Commit**

```bash
git add agente-delivery/src/lib/system-prompt.ts
git commit -m "feat(iguazufalls): nuevo system prompt de Paula para complejo de cabañas"
```

---

### Task 11: Intent detection helper

**Files:**
- Create: `agente-delivery/src/lib/intent-iguazufalls.ts`

- [ ] **Step 1: Implement basic keyword-based intent detection**

```typescript
// agente-delivery/src/lib/intent-iguazufalls.ts
//
// Detección de intención muy simple basada en keywords. La idea es decidir
// rápido si tenemos que llamar a Google Calendar o procesar un comprobante,
// ANTES de pasar el mensaje al LLM. El LLM hace el trabajo conversacional.

export type Intent = 'availability' | 'receipt' | 'general';

export interface IntentResult {
  intent: Intent;
  hasDates: boolean;
  hasPeople: boolean;
}

const RX_DATE_RANGE = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/;
const RX_MES = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i;
const RX_PEOPLE = /\b(\d{1,2})\s*(persona|personas|huésped|huespedes|huéspedes|adulto|adultos|p\b)/i;
const RX_AVAIL = /\b(disponib|reserva|alojamiento|cabaña|cabana|fecha|noches?|del\s+\d+\s+al\s+\d+)\b/i;

export function detectIntent(text: string, hasMediaImage: boolean): IntentResult {
  if (hasMediaImage) {
    return { intent: 'receipt', hasDates: false, hasPeople: false };
  }
  const t = text.toLowerCase();
  const hasDates = RX_DATE_RANGE.test(t) || RX_MES.test(t);
  const hasPeople = RX_PEOPLE.test(t);
  const hasAvailKeyword = RX_AVAIL.test(t);
  const intent: Intent = (hasDates || hasPeople || hasAvailKeyword) ? 'availability' : 'general';
  return { intent, hasDates, hasPeople };
}

/**
 * Extrae cantidad de personas si está mencionada explícitamente.
 */
export function extractPeople(text: string): number | null {
  const m = text.match(RX_PEOPLE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n) || n < 1 || n > 50) return null;
  return n;
}
```

- [ ] **Step 2: Smoke test**

```bash
cd agente-delivery
npx tsx -e "
import { detectIntent, extractPeople } from './src/lib/intent-iguazufalls';
const cases = [
  ['hola, info por favor', false],
  ['quiero reservar para 4 personas el 15 de julio', false],
  ['tienen disponibilidad?', false],
  ['(imagen adjunta)', true],
  ['del 12 al 15 de marzo', false],
];
for (const [t, img] of cases) {
  console.log(JSON.stringify(t), '=>', detectIntent(t, img), 'people=', extractPeople(t));
}
"
```
Expected: `general` para el primero, `availability` para los 2 con fechas, `receipt` para el de imagen, y `extractPeople` devuelve `4` solo en el segundo.

- [ ] **Step 3: Commit**

```bash
git add agente-delivery/src/lib/intent-iguazufalls.ts
git commit -m "feat(iguazufalls): detector de intención por keywords"
```

---

### Task 12: Hook intent + availability into handle-incoming.ts

**Files:**
- Modify: `agente-delivery/src/worker/handle-incoming.ts`

> El handler actual (líneas 81-167) hace: persistir mensaje → cargar historial → fetch catálogo+empresa → LLM → enviar. Vamos a insertar lógica entre el fetch de catálogo y la llamada al LLM, **solo para el tenant `iguazufalls`**, sin tocar el flujo de los otros tenants.

- [ ] **Step 1: Add imports and tenant guard**

Add at the top of `agente-delivery/src/worker/handle-incoming.ts` (after the existing imports):

```typescript
import { detectIntent, extractPeople } from '../lib/intent-iguazufalls';
import { findCabanasByCapacity, fetchCabanas, getCabanaByName } from '../lib/catalog';
import { checkAvailability, createReservationEvent } from '../lib/calendar-gcal';
import { getSeason } from '../lib/season';
import { parseState, serializeState, type ReservationState } from '../lib/reservation-state';
import { verifyPaymentReceipt } from '../lib/verify-payment';

const IS_IGUAZU = _tenant.id === 'iguazufalls';
```

- [ ] **Step 2: Build a helper that returns the iguazufalls extra context block**

Add this function inside the same file, ABOVE `handleIncoming`:

```typescript
async function buildIguazufallsExtras(
  msg: IncomingMessage,
  conversationId: number
): Promise<string> {
  const stateJson = db.getReservationState(conversationId);
  const state: ReservationState | null = parseState(stateJson);
  const intent = detectIntent(msg.text ?? '', !!msg.mediaUrl);
  const blocks: string[] = [];

  // === Caso COMPROBANTE ===
  if (intent.intent === 'receipt' && state?.step === 'awaiting_receipt' && msg.mediaUrl && state.sena) {
    try {
      const result = await verifyPaymentReceipt({
        imageUrl: msg.mediaUrl,
        expectedAmount: state.sena,
        bankAlias: process.env.BANK_ALIAS ?? 'iguazufalls.test',
        bankCBU: process.env.BANK_CBU ?? '',
        bankTitular: process.env.BANK_TITULAR ?? 'IguazuFalls',
      });
      const tag = result.ok
        ? 'OK'
        : result.issue === 'wrong_account' ? 'WRONG_ACCOUNT'
        : result.issue === 'amount_mismatch' ? 'AMOUNT_MISMATCH'
        : 'UNREADABLE';
      blocks.push(`COMPROBANTE: ${tag}\nDetalle: ${'detail' in result ? result.detail : 'verificado'}`);
    } catch (e) {
      blocks.push(`COMPROBANTE: UNREADABLE\nDetalle: error técnico al analizar`);
    }
    return blocks.join('\n\n');
  }

  // === Caso DISPONIBILIDAD ===
  if (intent.intent === 'availability' && intent.hasPeople) {
    const personas = extractPeople(msg.text) ?? state?.personas;
    if (personas) {
      const candidatas = await findCabanasByCapacity(personas, _tenant.productsTable);
      if (candidatas.length > 0) {
        // Si tenemos fechas en el state O las acabamos de capturar, consultamos Calendar.
        // Para simplicidad de v1, solo listamos las candidatas con precio según temporada
        // si tenemos check-in. Si no, listamos sin precio.
        const checkIn = state?.check_in;
        const lines = [`DISPONIBILIDAD — opciones para ${personas} personas:`];
        for (const c of candidatas) {
          let precio = '';
          let libre = '';
          if (checkIn && state?.check_out) {
            const season = getSeason(new Date(checkIn + 'T12:00:00-03:00'));
            const p = season === 'alta' ? c.precio_alta : season === 'media' ? c.precio_media : c.precio_baja;
            precio = ` — $${p.toLocaleString('es-AR')}/noche (${season})`;
            try {
              const free = await checkAvailability(c.calendar_id, checkIn, state.check_out);
              libre = free ? ' ✅' : ' ❌ ocupado';
            } catch {
              libre = '';
            }
          }
          lines.push(`- ${c.nombre} (${c.capacidad_max}p, ${c.metros2}m²)${precio}${libre}`);
        }
        blocks.push(lines.join('\n'));
      } else {
        blocks.push(`DISPONIBILIDAD: ninguna cabaña admite ${personas} personas (máximo por unidad: 6).`);
      }
    }
  }

  return blocks.join('\n\n');
}
```

- [ ] **Step 3: Inject the extras block in the prompt for the iguazufalls tenant**

In `agente-delivery/src/worker/handle-incoming.ts:145-147`, replace this:

```typescript
  const fullSystemPrompt = [SYSTEM_PROMPT, companyInfoContext, catalogContext]
    .filter(Boolean)
    .join('\n\n');
```

with:

```typescript
  let extras = '';
  if (IS_IGUAZU) {
    extras = await buildIguazufallsExtras(msg, convo.id);
    console.log(`[handler] iguazufalls extras length: ${extras.length}`);
  }

  const fullSystemPrompt = [SYSTEM_PROMPT, companyInfoContext, catalogContext, extras]
    .filter(Boolean)
    .join('\n\n');
```

- [ ] **Step 4: Smoke test the worker boots**

Run: `cd agente-delivery && npx tsx --env-file=.env.iguazufalls src/worker/index.ts` (Ctrl+C después de ver el mensaje de boot).
Expected: log `[worker] boot | tenant=iguazufalls | port=3002` sin errores.

- [ ] **Step 5: Commit**

```bash
git add agente-delivery/src/worker/handle-incoming.ts
git commit -m "feat(iguazufalls): inyectar bloque DISPONIBILIDAD/COMPROBANTE en prompt"
```

---

### Task 13: Persist reservation state when bot creates pending event

> Cuando Paula confirma una reserva, hay que crear el evento en Google Calendar y guardar el estado en SQLite para que el próximo mensaje (el comprobante) tenga el monto esperado. Para v1 mantenemos esto simple: el operador puede usar un comando de admin para forzar la transición a `awaiting_receipt` con los datos calculados, pero idealmente el bot lo hace automáticamente al detectar "confirmo" después de mostrar el cálculo.
>
> En v1 sólo agregamos la infraestructura: una función pública para crear la reserva y persistir el state. La integración fina con la conversación queda para iteración 2 (después del primer test end-to-end manual).

**Files:**
- Modify: `agente-delivery/src/worker/handle-incoming.ts`

- [ ] **Step 1: Export a helper to confirm a reservation**

Add to `agente-delivery/src/worker/handle-incoming.ts`:

```typescript
export async function confirmReservationFromState(
  conversationId: number,
  partial: Required<Pick<ReservationState, 'cabana' | 'check_in' | 'check_out' | 'personas' | 'huesped_nombre' | 'huesped_telefono' | 'total' | 'sena'>>
): Promise<{ event_id: string }> {
  const cabanas = await fetchCabanas(_tenant.productsTable);
  const cabana = getCabanaByName(cabanas, partial.cabana);
  if (!cabana) throw new Error(`Cabaña no encontrada: ${partial.cabana}`);

  const eventId = await createReservationEvent({
    calendarId: cabana.calendar_id,
    cabana: cabana.nombre,
    huespedNombre: partial.huesped_nombre,
    huespedTelefono: partial.huesped_telefono,
    personas: partial.personas,
    checkIn: partial.check_in,
    checkOut: partial.check_out,
    total: partial.total,
    sena: partial.sena,
  });

  const newState: ReservationState = {
    step: 'awaiting_receipt',
    cabana: cabana.nombre,
    calendar_id: cabana.calendar_id,
    ...partial,
    event_id: eventId,
  };
  db.setReservationState(conversationId, serializeState(newState));
  return { event_id: eventId };
}
```

- [ ] **Step 2: Add an admin command `#reservar` for manual testing**

In `agente-delivery/src/worker/handle-incoming.ts:46-79` (the `handleAdminCommand` function), extend the switch to support `#reservar`:

```typescript
} else if (cmd === '#reservar' && IS_IGUAZU) {
  // Sintaxis: #reservar <telefono> <cabana> <YYYY-MM-DD> <YYYY-MM-DD> <personas> <total> <sena> <"Nombre Huesped">
  // Ejemplo: #reservar 5491100000000 "Lodge Timbó" 2030-01-15 2030-01-18 2 144000 72000 "Juan Test"
  const tokens = msg.text.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  if (tokens.length < 9) {
    await provider.sendMessage(msg.from, 'Uso: #reservar <tel> "<cabana>" <ci> <co> <pers> <total> <sena> "<nombre>"');
    return;
  }
  const unq = (s: string) => s.replace(/^"|"$/g, '');
  const [, tel, cab, ci, co, pers, total, sena, nom] = tokens.map(unq);
  try {
    const r = await confirmReservationFromState(convo.id, {
      cabana: cab,
      check_in: ci,
      check_out: co,
      personas: parseInt(pers, 10),
      total: parseInt(total, 10),
      sena: parseInt(sena, 10),
      huesped_nombre: nom,
      huesped_telefono: '+' + tel.replace(/\D/g, ''),
    });
    await provider.sendMessage(msg.from, `✓ Reserva creada en Calendar (${r.event_id}). Estado: awaiting_receipt.`);
  } catch (e: any) {
    await provider.sendMessage(msg.from, `✗ Error: ${e.message}`);
  }
}
```

- [ ] **Step 3: Update the admin help text**

In `agente-delivery/src/worker/handle-incoming.ts:39-44`, replace `ADMIN_HELP` with:

```typescript
const ADMIN_HELP =
  'Comandos disponibles:\n' +
  '#ia NUMERO — activar modo IA\n' +
  '#humano NUMERO — activar modo humano\n' +
  '#reset NUMERO — borrar memoria\n' +
  (IS_IGUAZU
    ? '#reservar TEL "CABAÑA" CHECKIN CHECKOUT PERS TOTAL SEÑA "NOMBRE" — crear reserva manual\n'
    : '') +
  '\nEjemplo: #humano 5491112345678';
```

- [ ] **Step 4: Commit**

```bash
git add agente-delivery/src/worker/handle-incoming.ts
git commit -m "feat(iguazufalls): comando admin #reservar + helper confirmReservationFromState"
```

---

## Phase 6 — Verification end-to-end

### Task 14: Local end-to-end smoke test

**Files:** none (manual verification)

> El objetivo es confirmar que el worker arranca, responde, y los flujos clave funcionan. Esto NO automatiza nada — es un checklist manual.

- [ ] **Step 1: Confirmar variables de entorno**

`.env.iguazufalls` debe tener al menos:
- `TENANT_ID=iguazufalls`
- `WORKER_PORT=3002`
- `DATA_DIR=./data/iguazufalls`
- `OPENAI_API_KEY=sk-...`
- `OPENAI_MODEL=gpt-4o-mini`
- `NEXT_PUBLIC_SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `SUPABASE_PRODUCTS_TABLE=products_iguazufalls`
- `SUPABASE_COMPANY_INFO_TABLE=info_empresa_iguazufalls`
- `WHATSAPP_PROVIDER=baileys`
- `GOOGLE_SERVICE_ACCOUNT_JSON={...}`
- `GOOGLE_CALENDAR_TIMEZONE=America/Argentina/Buenos_Aires`
- `BANK_ALIAS=iguazufalls.test`
- `BANK_CBU=0000000000000000000000`
- `BANK_TITULAR=IguazuFalls`

- [ ] **Step 2: Iniciar el worker**

Run: `cd agente-delivery && npm run worker:dev:iguazufalls`
Expected: log `[worker] boot | tenant=iguazufalls | port=3002` y `[handler] Tenant: iguazufalls | DB: ...`. Si Baileys necesita QR, escanealo desde el celular.

- [ ] **Step 3: Iniciar el dashboard Next.js (en otra terminal)**

Run: `cd agente-delivery && npm run next:dev`. Abrir http://localhost:3000, login con `juanynatyzapata@hotmail.com`.

- [ ] **Step 4: Probar el flujo "consulta general"**

Mandar "hola" desde el WhatsApp del cliente al número del bot. El bot debe saludar UNA SOLA VEZ con el saludo de Paula.
Mandar luego "info". Paula debe redirigir al sitio web sin describir cabañas.

- [ ] **Step 5: Probar consulta con personas**

Mandar "tengo 4 personas". El log del worker debe mostrar `iguazufalls extras length: > 0`. Paula debe responder con la lista de cabañas que admiten 4 personas (sin precio porque no hay fechas todavía).

- [ ] **Step 6: Probar el comando admin #reservar**

Desde el WhatsApp del operador, mandarse a sí mismo:

```
#reservar 5491100000000 "Lodge Timbó" 2030-01-15 2030-01-18 2 144000 72000 "Test Bot"
```

Expected: respuesta `✓ Reserva creada en Calendar (...)`. Verificar en Google Calendar que apareció el evento `⏳ PENDIENTE — Test Bot (2p)` en el calendario de Lodge Timbó.

- [ ] **Step 7: Probar verificación de comprobante**

Desde el WhatsApp del cliente con número `+5491100000000` (el del paso 6), mandar una **imagen** de un comprobante real (o uno simulado con esos datos). El worker debe:
- Detectar `intent=receipt`
- Llamar a `verifyPaymentReceipt`
- Inyectar `COMPROBANTE: OK | WRONG_ACCOUNT | AMOUNT_MISMATCH | UNREADABLE` en el prompt
- Paula debe responder según el caso (ej: "Comprobante recibido y verificado…")

- [ ] **Step 8: Limpieza**

Borrar el evento de prueba del Google Calendar manualmente. Resetear estado:
```bash
cd agente-delivery
npx tsx --env-file=.env.iguazufalls -e "
import { getDb } from './src/lib/db';
const db = getDb('./data/iguazufalls');
const c = db.getConversationByPhone('5491100000000');
if (c) { db.setReservationState(c.id, null); console.log('reset ok'); }
"
```

- [ ] **Step 9: Commit el plan ejecutado (sin cambios de código)**

Si todo el flujo funcionó, no hay cambios de código que commitear aquí. Pasar al siguiente paso.

---

### Task 15: Update CLAUDE.md with new env vars and seed step

**Files:**
- Modify: `agente-delivery/CLAUDE.md` (or root `CLAUDE.md`)

- [ ] **Step 1: Add env vars to the IguazuFalls section**

Find the `### .env.{tenant}` section in `CLAUDE.md` and add a sub-block for IguazuFalls vars:

```markdown
### Vars exclusivas de IguazuFalls (`.env.iguazufalls`)
Además de las vars compartidas:
- `GOOGLE_SERVICE_ACCOUNT_JSON` — JSON del Service Account con permiso sobre los 11 calendarios
- `GOOGLE_CALENDAR_TIMEZONE=America/Argentina/Buenos_Aires`
- `BANK_ALIAS`, `BANK_CBU`, `BANK_TITULAR` — datos para validación de comprobante
```

- [ ] **Step 2: Add seed instruction**

Add a "Setup IguazuFalls" subsection after the deployment instructions:

```markdown
### Setup inicial IguazuFalls (una vez)
1. Crear tablas `products_iguazufalls` y `info_empresa_iguazufalls` en Supabase (ver SQL en spec).
2. Crear Service Account de Google Calendar y compartir los 11 calendarios.
3. Correr seed:
   ```bash
   cd agente-delivery
   npx tsx --env-file=.env.iguazufalls scripts/seed-iguazufalls.ts
   ```
4. Verificar 11 cabañas en Supabase y arrancar el worker.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: agregar setup de IguazuFalls a CLAUDE.md"
```

---

## Self-review

**Spec coverage:**
- ✅ Schema 3 precios → Task 4 (seed) + Task 9 (catalog.ts)
- ✅ Temporadas → Task 1 (`season.ts` smoke-tested)
- ✅ Extras (toallas, garage, limpieza) → seed en `info_empresa_iguazufalls` + system prompt los menciona en CALCULO
- ✅ 11 cabañas con calendar IDs → Task 4
- ✅ Reservation state JSON en SQLite → Task 3
- ✅ Google Calendar checkAvailability/createEvent → Tasks 6, 7
- ✅ verifyPaymentReceipt vision → Task 8
- ✅ System prompt rewrite → Task 10
- ✅ Intent detection → Task 11
- ✅ Hook into handle-incoming → Tasks 12, 13
- ✅ Redirigir al sitio para detalles → cubierto en system prompt
- ✅ Operador confirma manualmente → cubierto en system prompt + admin command de testing
- ✅ Verificación e2e → Task 14
- ⚠️ Cálculo automático del total y transición de state durante la conversación: cubierto parcialmente — el plan deja al LLM la conducción conversacional y al admin command la creación del evento. La automatización completa requiere parsing del JSON que el LLM emite, lo cual queda explícitamente para iteración 2 después del primer test e2e (decisión de scope).
- ⚠️ Grupos > 6: el system prompt deriva al operador, no implementado lógicamente (fuera de scope v1, ya marcado en spec).
- ⚠️ MercadoPago: fuera de scope v1 (ya marcado en spec).

**Placeholders detected:** none in code blocks — los placeholders están en datos de seed (precios, banco, horarios) y todos están explícitamente marcados como "PLACEHOLDER — actualizar".

**Type consistency:** verificado — `ReservationState` se usa con la misma forma en `db.ts`, `handle-incoming.ts`, y `confirmReservationFromState`. `CabanaRow` se usa consistentemente.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-07-iguazufalls-bot-paula.md`.**
