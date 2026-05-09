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
// Match formas: "4 personas", "4 adultos", "para 4", "somos 4", "seremos 4", "5 pax", "4 p"
const RX_PEOPLE = /\b(\d{1,2})\s*(persona|personas|huésped|huespedes|huéspedes|adulto|adultos|pax|pessoas|guests|adults|p\b)|\b(?:somos|seremos|para|son|sou)\s+(\d{1,2})\b/i;
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
  // El regex tiene 2 grupos alternativos: m[1] del primer pattern, m[3] del segundo
  const numStr = m[1] ?? m[3];
  if (!numStr) return null;
  const n = parseInt(numStr, 10);
  if (Number.isNaN(n) || n < 1 || n > 50) return null;
  return n;
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/**
 * Extrae un rango de fechas (check-in / check-out) de un texto en español.
 * Soporta los formatos más comunes:
 *   - "del 10 al 13 de junio de 2026"
 *   - "10 al 13 de junio 2026"
 *   - "del 10/06/2026 al 13/06/2026"
 *   - "10-06 al 13-06"
 * Si no detecta año explícito, asume el próximo período válido (este año si el mes
 * no pasó, sino el año siguiente).
 *
 * Devuelve null si no logra extraer un rango válido.
 */
export function extractDateRange(text: string): { ci: string; co: string } | null {
  const t = text.toLowerCase();
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  const yearForMonth = (month: number, explicit?: number): number => {
    if (explicit) return explicit < 100 ? 2000 + explicit : explicit;
    return month >= curMonth ? curYear : curYear + 1;
  };

  // "del 10 al 13 de junio de 2026" / "10 al 13 de junio"
  const rxLong = /(?:del?\s+)?(\d{1,2})\s+(?:al?|a|hasta)\s+(?:el\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+(\d{4}))?/;
  const m1 = t.match(rxLong);
  if (m1) {
    const d1 = parseInt(m1[1], 10);
    const d2 = parseInt(m1[2], 10);
    const month = MESES[m1[3]];
    const year = yearForMonth(month, m1[4] ? parseInt(m1[4], 10) : undefined);
    if (d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31 && d2 > d1) {
      return {
        ci: `${year}-${String(month).padStart(2, '0')}-${String(d1).padStart(2, '0')}`,
        co: `${year}-${String(month).padStart(2, '0')}-${String(d2).padStart(2, '0')}`,
      };
    }
  }

  // "10/06 al 13/06" o "10/06/2026 al 13/06/2026" o "10-6 a 13-6"
  const rxNum = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s+(?:al?|a|hasta)\s+(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
  const m2 = t.match(rxNum);
  if (m2) {
    const d1 = parseInt(m2[1], 10);
    const mo1 = parseInt(m2[2], 10);
    const y1 = m2[3] ? parseInt(m2[3], 10) : undefined;
    const d2 = parseInt(m2[4], 10);
    const mo2 = parseInt(m2[5], 10);
    const y2 = m2[6] ? parseInt(m2[6], 10) : undefined;
    if (d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31 && mo1 >= 1 && mo1 <= 12 && mo2 >= 1 && mo2 <= 12) {
      const year1 = yearForMonth(mo1, y1);
      const year2 = yearForMonth(mo2, y2 ?? y1);
      const ci = `${year1}-${String(mo1).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
      const co = `${year2}-${String(mo2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
      if (new Date(co) > new Date(ci)) return { ci, co };
    }
  }

  return null;
}
