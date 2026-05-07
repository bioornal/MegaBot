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
