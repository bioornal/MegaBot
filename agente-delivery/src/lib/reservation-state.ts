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
