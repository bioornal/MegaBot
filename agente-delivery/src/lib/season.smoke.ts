import { getSeason } from './season';

const cases: Array<{ date: string; expected: 'alta' | 'media' | 'baja'; note: string }> = [
  { date: '2026-07-15', expected: 'alta',  note: 'pleno invierno (15 jun-15 ago)' },
  { date: '2026-06-15', expected: 'alta',  note: 'borde inicial alta' },
  { date: '2026-08-15', expected: 'alta',  note: 'borde final alta' },
  { date: '2026-12-25', expected: 'alta',  note: 'navidad' },
  { date: '2026-01-15', expected: 'alta',  note: 'enero plena' },
  { date: '2026-02-19', expected: 'alta',  note: 'fin de alta verano (20 feb)' },
  { date: '2026-04-19', expected: 'alta',  note: 'semana santa (18-21 abr)' },
  { date: '2026-02-25', expected: 'media', note: 'fin febrero media' },
  { date: '2026-03-15', expected: 'media', note: 'marzo media' },
  { date: '2026-03-31', expected: 'media', note: 'borde final media' },
  { date: '2026-05-10', expected: 'baja',  note: 'mayo baja' },
  { date: '2026-09-20', expected: 'baja',  note: 'septiembre baja' },
  { date: '2026-04-10', expected: 'baja',  note: 'abril baja antes semana santa' },
  { date: '2026-04-22', expected: 'baja',  note: 'abril baja despues semana santa' },
];

let failures = 0;
for (const c of cases) {
  const got = getSeason(new Date(c.date + 'T12:00:00-03:00'));
  if (got !== c.expected) {
    console.error(`FAIL ${c.date} (${c.note}) — esperado ${c.expected}, obtenido ${got}`);
    failures++;
  } else {
    console.log(`ok   ${c.date} → ${got} (${c.note})`);
  }
}
if (failures > 0) {
  console.error(`\n${failures} fallos`);
  process.exit(1);
}
console.log(`\n${cases.length} casos ok`);
