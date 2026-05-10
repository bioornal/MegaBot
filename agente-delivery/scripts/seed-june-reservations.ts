// scripts/seed-june-reservations.ts
// Inyecta 20 reservas REALES en junio 2026 para probar solapamientos
// Ejecutar: npx tsx --env-file=.env.iguazufalls scripts/seed-june-reservations.ts

import { createReservationEvent, updateReservationEvent } from '../src/lib/calendar-gcal';
import { appendReservationRow } from '../src/lib/sheets-client';
import { fetchCabanas } from '../src/lib/catalog';

const nombres = [
  'María González', 'Carlos Rodríguez', 'Ana Fernández', 'Luis Martínez',
  'Laura López', 'Pedro Sánchez', 'Sofía García', 'Diego Romero',
  'Valentina Torres', 'Martín Herrera', 'Camila Ruiz', 'Javier Díaz',
  'Florencia Castro', 'Andrés Morales', 'Lucía Ortega', 'Federico Vega',
  'Juliana Ríos', 'Gabriel Silva', 'Rocío Mendoza', 'Julieta Pérez',
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function main() {
  console.log('🏡 Obteniendo cabañas reales de Supabase...');
  const cabanas = await fetchCabanas();
  if (cabanas.length === 0) {
    console.error('❌ No se encontraron cabañas. Verificar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  console.log(`   ✅ ${cabanas.length} cabañas encontradas`);

  // Grupos de fechas con solapamientos intencionales
  // Queremos que algunas fechas se solapen para probar la ocupacion
  const fechaBases = [
    { inicio: new Date('2026-06-01'), variacion: 0 },
    { inicio: new Date('2026-06-03'), variacion: 2 },
    { inicio: new Date('2026-06-05'), variacion: 4 },
    { inicio: new Date('2026-06-08'), variacion: 1 },
    { inicio: new Date('2026-06-10'), variacion: 3 },
    { inicio: new Date('2026-06-12'), variacion: 0 },
    { inicio: new Date('2026-06-15'), variacion: 2 },
    { inicio: new Date('2026-06-18'), variacion: 1 },
    { inicio: new Date('2026-06-20'), variacion: 3 },
    { inicio: new Date('2026-06-22'), variacion: 0 },
    { inicio: new Date('2026-06-25'), variacion: 2 },
    { inicio: new Date('2026-06-28'), variacion: 1 },
    { inicio: new Date('2026-06-01'), variacion: 5 },  // Solapado con el primero
    { inicio: new Date('2026-06-05'), variacion: 3 },  // Solapado
    { inicio: new Date('2026-06-10'), variacion: 0 },  // Solapado
    { inicio: new Date('2026-06-15'), variacion: 5 },  // Solapado
    { inicio: new Date('2026-06-20'), variacion: 1 },  // Solapado
    { inicio: new Date('2026-06-08'), variacion: 4 },  // Solapado
    { inicio: new Date('2026-06-12'), variacion: 6 },  // Solapado
    { inicio: new Date('2026-06-25'), variacion: 4 },  // Solapado
  ];

  let exitosos = 0;
  let fallidos = 0;

  for (let i = 0; i < 20; i++) {
    const cabana = cabanas[i % cabanas.length];
    const base = fechaBases[i];
    const checkIn = addDays(base.inicio, base.variacion);
    const noches = randomInt(2, 6);
    const checkOut = addDays(checkIn, noches);
    const personas = randomInt(cabana.capacidad_min, cabana.capacidad_max);
    const precioNoche = cabana.precio_baja; // Junio es baja temporada
    const total = precioNoche * noches;
    const sena = Math.round(total * 0.5);
    const nombre = nombres[i];
    const telefono = `+54911${randomInt(10000000, 99999999)}`;

    console.log(`\n📅 ${i + 1}/20 — ${nombre}`);
    console.log(`   🏠 ${cabana.nombre} (${personas}p)`);
    console.log(`   📆 ${formatDate(checkIn)} → ${formatDate(checkOut)} (${noches} noches)`);

    try {
      // 1. Crear evento PENDIENTE en Calendar
      const eventId = await createReservationEvent({
        calendarId: cabana.calendar_id,
        cabana: cabana.nombre,
        huespedNombre: nombre,
        huespedTelefono: telefono,
        personas,
        checkIn: formatDate(checkIn),
        checkOut: formatDate(checkOut),
        total,
        sena,
      });
      console.log(`   ✅ Calendar: ${eventId}`);

      // 2. Pasar a CONFIRMADO en Calendar (simula comprobante verificado)
      await updateReservationEvent(
        cabana.calendar_id,
        eventId,
        'confirmed',
        nombre,
        personas
      );
      console.log(`   ✅ Calendar → CONFIRMADO`);

      // 3. Insertar en Sheets
      await appendReservationRow({
        fechaConfirmacion: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
        nombre,
        telefono,
        cabana: cabana.nombre,
        checkIn: formatDate(checkIn),
        checkOut: formatDate(checkOut),
        personas,
        total,
        sena,
        noches,
        estado: 'CONFIRMADO',
      });
      console.log(`   ✅ Sheets: CONFIRMADO`);

      exitosos++;
    } catch (e: any) {
      console.error(`   ❌ Error: ${e.message}`);
      fallidos++;
    }

    // Delay para no saturar APIs
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log('\n═══════════════════════════════════════');
  console.log('📊 RESUMEN DE INYECCIÓN');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Exitosos: ${exitosos}`);
  console.log(`❌ Fallidos: ${fallidos}`);
  console.log(`📈 Total: ${exitosos + fallidos}`);
  console.log('\n📅 Revisa tu calendario y tu hoja de Sheets!');
  console.log('🔗 Sheets: https://docs.google.com/spreadsheets/d/18RB82kbpxoLT20F1cCHxE3QZwZDlGTLslrn80gUxcPo/edit');

  process.exit(fallidos > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Error fatal:', e);
  process.exit(1);
});
