import { google } from 'googleapis';
import { appendReservationRow } from '../src/lib/sheets-client';
import { createReservationEvent, checkAvailability } from '../src/lib/calendar-gcal';

async function testE2E() {
  console.log('🧪 TEST END-TO-END: Calendar + Sheets\n');

  // Test 1: Verificar Calendar API
  console.log('1️⃣  Verificando Google Calendar API...');
  try {
    const free = await checkAvailability('c_6pphk6eivq7t8v5l9h2q4r1o0i3u5y7a9s1d3f5g7h9@group.calendar.google.com', '2026-12-01', '2026-12-02');
    console.log('   ✅ Calendar API responde correctamente');
  } catch (e: any) {
    console.log('   ⚠️  Calendar:', e.message);
  }

  // Test 2: Crear evento PENDIENTE en Calendar
  console.log('\n2️⃣  Creando evento PENDIENTE en Calendar...');
  let eventId = '';
  try {
    eventId = await createReservationEvent({
      calendarId: 'c_6pphk6eivq7t8v5l9h2q4r1o0i3u5y7a9s1d3f5g7h9@group.calendar.google.com',
      cabana: 'Lodge Lapacho TEST',
      huespedNombre: 'Cliente Prueba E2E',
      huespedTelefono: '+5491111111111',
      personas: 4,
      checkIn: '2026-12-15',
      checkOut: '2026-12-20',
      total: 100000,
      sena: 50000,
    });
    console.log(`   ✅ Evento creado: ${eventId}`);
  } catch (e: any) {
    console.log('   ❌ Error:', e.message);
  }

  // Test 3: Insertar en Sheets como PENDIENTE
  console.log('\n3️⃣  Insertando fila PENDIENTE en Sheets...');
  try {
    await appendReservationRow({
      fechaConfirmacion: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
      nombre: 'Cliente Prueba E2E',
      telefono: '+5491111111111',
      cabana: 'Lodge Lapacho TEST',
      checkIn: '2026-12-15',
      checkOut: '2026-12-20',
      personas: 4,
      total: 100000,
      sena: 50000,
      noches: 5,
      estado: 'PENDIENTE',
    });
    console.log('   ✅ Fila PENDIENTE insertada');
  } catch (e: any) {
    console.log('   ❌ Error:', e.message);
  }

  // Test 4: Insertar en Sheets como CONFIRMADO (simulando comprobante verificado)
  console.log('\n4️⃣  Insertando fila CONFIRMADO en Sheets...');
  try {
    await appendReservationRow({
      fechaConfirmacion: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
      nombre: 'Cliente Prueba E2E',
      telefono: '+5491111111111',
      cabana: 'Lodge Lapacho TEST',
      checkIn: '2026-12-15',
      checkOut: '2026-12-20',
      personas: 4,
      total: 100000,
      sena: 50000,
      noches: 5,
      estado: 'CONFIRMADO',
    });
    console.log('   ✅ Fila CONFIRMADO insertada');
  } catch (e: any) {
    console.log('   ❌ Error:', e.message);
  }

  console.log('\n═══════════════════════════════════════');
  console.log('📊 RESULTADOS');
  console.log('═══════════════════════════════════════');
  console.log('Evento Calendar ID:', eventId || 'Error');
  console.log('Hoja Sheets: https://docs.google.com/spreadsheets/d/18RB82kbpxoLT20F1cCHxE3QZwZDlGTLslrn80gUxcPo/edit');
  console.log('\n✅ Revisa tu hoja y tu calendario para verificar!');
}

testE2E().catch(console.error);
