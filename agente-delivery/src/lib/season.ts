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
