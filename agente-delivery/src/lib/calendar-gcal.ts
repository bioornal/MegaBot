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
