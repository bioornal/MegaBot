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
const RX_AVAIL = /\b(disponib|reserva|alojamiento|cabaña|cabana|fecha|noches?|del\s+\d+\s+al\s+\d+)/i;

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
