import { appendReservationRow } from '../src/lib/sheets-client';

const nombres = [
  'Juan Pérez', 'María González', 'Carlos Rodríguez', 'Ana Fernández',
  'Luis Martínez', 'Laura López', 'Pedro Sánchez', 'Sofía García',
  'Diego Romero', 'Valentina Torres', 'Martín Herrera', 'Camila Ruiz',
  'Javier Díaz', 'Florencia Castro', 'Andrés Morales', 'Lucía Ortega',
  'Federico Vega', 'Juliana Ríos', 'Gabriel Silva', 'Rocío Mendoza',
];

const cabanas = [
  'Lodge Lapacho', 'Lodge Ambay', 'Studio Ombú', 'Duplex Timbó',
  'Studio Palo Rosa', 'Lodge Guayubira', 'Duplex Yatay', 'Studio Jacarandá',
  'Lodge Ceibo', 'Studio Ibirá Pitá', 'Duplex Tipa',
];

const hoy = new Date();

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
  console.log('Insertando 20 reservas de prueba CONFIRMADAS...');

  for (let i = 0; i < 20; i++) {
    const checkIn = addDays(hoy, randomInt(5, 120));
    const noches = randomInt(2, 7);
    const checkOut = addDays(checkIn, noches);
    const personas = randomInt(2, 6);
    const precioNoche = randomInt(15000, 35000);
    const total = precioNoche * noches;
    const sena = Math.round(total * 0.5);

    const telefono = `+54911${randomInt(10000000, 99999999)}`;

    try {
      await appendReservationRow({
        fechaConfirmacion: addDays(hoy, randomInt(-30, 0)).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
        nombre: nombres[i],
        telefono,
        cabana: cabanas[randomInt(0, cabanas.length - 1)],
        checkIn: formatDate(checkIn),
        checkOut: formatDate(checkOut),
        personas,
        total,
        sena,
        noches,
        estado: 'CONFIRMADO',
      });
      console.log(`✅ ${i + 1}/20 ${nombres[i]} — ${formatDate(checkIn)} → ${formatDate(checkOut)}`);
    } catch (e) {
      console.error(`❌ ${i + 1}/20 Error:`, e);
    }

    // Pequeño delay para no saturar la API
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('Listo. Revisá tu hoja de Google Sheets.');
}

main();
