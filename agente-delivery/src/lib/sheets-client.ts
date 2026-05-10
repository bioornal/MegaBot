import { google } from 'googleapis';

let _sheetsClient: ReturnType<typeof google.sheets> | null = null;

function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('[sheets-client] GOOGLE_SERVICE_ACCOUNT_JSON no definido en env');
  }

  let creds: { client_email: string; private_key: string };
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error('[sheets-client] GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido');
  }

  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

export interface ReservationRow {
  fechaConfirmacion: string;
  nombre: string;
  telefono: string;
  cabana: string;
  checkIn: string;
  checkOut: string;
  personas: number;
  total: number;
  sena: number;
  noches: number;
  estado: 'PENDIENTE' | 'CONFIRMADO' | 'CANCELADO';
}

/**
 * Agrega una fila al final de la hoja "Reservas".
 * La hoja debe tener una pestaña llamada exactamente "Reservas" con estos encabezados:
 * Fecha Conf. | Nombre | Teléfono | Cabaña | Check-in | Check-out | Personas | Total | Seña | Noches | Estado
 */
export async function appendReservationRow(row: ReservationRow): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    console.warn('[sheets-client] GOOGLE_SHEET_ID no definido — fila NO guardada');
    return;
  }

  const sheets = getSheetsClient();
  const range = 'Reservas!A:K';
  const values = [
    [
      row.fechaConfirmacion,
      row.nombre,
      row.telefono,
      row.cabana,
      row.checkIn,
      row.checkOut,
      String(row.personas),
      `$${row.total.toLocaleString('es-AR')}`,
      `$${row.sena.toLocaleString('es-AR')}`,
      String(row.noches),
      row.estado,
    ],
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    console.log(`[sheets-client] Fila agregada: ${row.nombre} | ${row.cabana} | ${row.estado}`);
  } catch (e: any) {
    console.error('[sheets-client] Error agregando fila:', e.message);
  }
}
