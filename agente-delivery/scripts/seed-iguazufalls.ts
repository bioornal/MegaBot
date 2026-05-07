// NOTA — Estado inicial:
// La carga inicial de las 11 cabañas + 17 entradas de info_empresa_iguazufalls
// fue aplicada directamente vía Supabase MCP (no con este script) porque
// SUPABASE_SERVICE_ROLE_KEY aún no está disponible en .env.iguazufalls.
// Este script queda para re-seeds futuros una vez que la key esté configurada.

// agente-delivery/scripts/seed-iguazufalls.ts
//
// Crea/actualiza las 11 cabañas + datos del complejo en Supabase.
// Idempotente: usa upsert por nombre (cabañas) y DELETE+INSERT por categoria (info empresa).
// Correr con:
//   cd agente-delivery && npx tsx --env-file=.env.iguazufalls scripts/seed-iguazufalls.ts
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en el env.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supa = createClient(url, key);

interface Cabana {
  nombre: string;
  tipo: 'Studio' | 'Lodge' | 'Duplex';
  descripcion: string;
  capacidad_min: number;
  capacidad_max: number;
  metros2: number;
  amenidades: string;
  precio_baja: number;
  precio_media: number;
  precio_alta: number;
  calendar_id: string;
  activo: boolean;
}

const CABANAS: Cabana[] = [
  { nombre: 'Studio Lapacho',  tipo: 'Studio', descripcion: 'Monoambiente con cocina completa, Queen + sofá cama', capacidad_min: 1, capacidad_max: 4, metros2: 25, amenidades: 'WiFi, AC, cocina completa, baño privado, TV cable, garage (consultar)', precio_baja: 35000, precio_media: 42000, precio_alta: 55000, calendar_id: 'b3e858337063872815929235fddfa2ad9ad1f22fc4c57ab6b09a351218454086@group.calendar.google.com', activo: true },
  { nombre: 'Studio Guembe',   tipo: 'Studio', descripcion: 'Monoambiente con microondas/frigobar, King + 2 individuales', capacidad_min: 1, capacidad_max: 4, metros2: 25, amenidades: 'WiFi, AC, microondas, frigobar, baño privado, TV cable, garage (consultar)', precio_baja: 35000, precio_media: 42000, precio_alta: 55000, calendar_id: '936df3b9fee5d46b62bb2509f62d833b08d514eff4572b99f3fd76f47d7a57f7@group.calendar.google.com', activo: true },
  { nombre: 'Lodge Ambay',     tipo: 'Lodge',  descripcion: 'Departamento acogedor de dos habitaciones', capacidad_min: 2, capacidad_max: 4, metros2: 30, amenidades: 'WiFi, AC, balcón privado, cocina equipada, baño privado, Queen + cucheta, TV cable, garage (consultar)', precio_baja: 45000, precio_media: 54000, precio_alta: 70000, calendar_id: '79f3cd533880add5fe08018c9d725cd31538dac7aea81b6cf99a1948e22ca75d@group.calendar.google.com', activo: true },
  { nombre: 'Lodge Palo Rosa', tipo: 'Lodge',  descripcion: 'Departamento acogedor de dos habitaciones', capacidad_min: 2, capacidad_max: 4, metros2: 30, amenidades: 'WiFi, AC, balcón privado, cocina equipada, baño privado, Queen + cucheta, TV cable, garage (consultar)', precio_baja: 45000, precio_media: 54000, precio_alta: 70000, calendar_id: 'b178b1ea4c8db01190779f39b39fca73babd744cbd9225734a64459c21237246@group.calendar.google.com', activo: true },
  { nombre: 'Lodge Araucaria', tipo: 'Lodge',  descripcion: 'Departamento moderno de una habitación', capacidad_min: 1, capacidad_max: 4, metros2: 25, amenidades: 'WiFi, AC, cocina equipada, baño privado, King + sofá cama, TV cable, garage (consultar)', precio_baja: 40000, precio_media: 48000, precio_alta: 62000, calendar_id: 'c8d3cf841b853bdbffa743e6f5125eb5d2d466ff9cd5eb74fe7fd143759302d5@group.calendar.google.com', activo: true },
  { nombre: 'Lodge Guatambú',  tipo: 'Lodge',  descripcion: 'Departamento moderno de una habitación', capacidad_min: 1, capacidad_max: 4, metros2: 25, amenidades: 'WiFi, AC, cocina equipada, baño privado, King + sofá cama, TV cable, garage (consultar)', precio_baja: 40000, precio_media: 48000, precio_alta: 62000, calendar_id: 'b51e195f11b8b36880b743b944a32761e12958915eea510c917f543a19c1c66b@group.calendar.google.com', activo: true },
  { nombre: 'Lodge Timbó',     tipo: 'Lodge',  descripcion: 'Departamento moderno de una habitación, íntimo', capacidad_min: 1, capacidad_max: 2, metros2: 20, amenidades: 'WiFi, AC, cocina equipada, baño privado, King, TV cable, garage (consultar)', precio_baja: 32000, precio_media: 38000, precio_alta: 48000, calendar_id: '4bae476b313c5383445a898ec07a834c0919abb053d513f20f1e90832af21617@group.calendar.google.com', activo: true },
  { nombre: 'Duplex Laurel',   tipo: 'Duplex', descripcion: 'Duplex confortable de 2 plantas', capacidad_min: 2, capacidad_max: 6, metros2: 50, amenidades: 'WiFi, AC, balcón privado, cocina equipada, baño privado, Queen (alta) + cucheta y 2 individuales (baja), TV cable, garage (consultar)', precio_baja: 60000, precio_media: 72000, precio_alta: 90000, calendar_id: 'eff75168b5d05a8cd9ef114db558eea22906353a6dbba4a814be37172df7a2a7@group.calendar.google.com', activo: true },
  { nombre: 'Duplex Cedro',    tipo: 'Duplex', descripcion: 'Duplex confortable de 2 plantas', capacidad_min: 2, capacidad_max: 6, metros2: 50, amenidades: 'WiFi, AC, balcón privado, cocina equipada, baño privado, Queen (alta) + cucheta y 2 individuales (baja), TV cable, garage (consultar)', precio_baja: 60000, precio_media: 72000, precio_alta: 90000, calendar_id: '5cc1e9e5b1b3e40a92b956e52a2b8be839423a9b6c64b6d177924553393098bf@group.calendar.google.com', activo: true },
  { nombre: 'Duplex Ombú',     tipo: 'Duplex', descripcion: 'Duplex confortable de 2 plantas', capacidad_min: 2, capacidad_max: 6, metros2: 50, amenidades: 'WiFi, AC, balcón privado, cocina equipada, baño privado, Queen (alta) + cucheta y 2 individuales (baja), TV cable, garage (consultar)', precio_baja: 60000, precio_media: 72000, precio_alta: 90000, calendar_id: 'c5c7557494415560a36c34f26dfb18afcf17ee8e6a6271482d1c5d1c6f93d2b6@group.calendar.google.com', activo: true },
  { nombre: 'Duplex Pitanga',  tipo: 'Duplex', descripcion: 'Duplex confortable de 2 plantas', capacidad_min: 2, capacidad_max: 6, metros2: 50, amenidades: 'WiFi, AC, balcón privado, cocina equipada, baño privado, Queen (alta) + cucheta y 2 individuales (baja), TV cable, garage (consultar)', precio_baja: 60000, precio_media: 72000, precio_alta: 90000, calendar_id: 'e185dda5604b4b30c0a86428f5d3ef42123ce26de8cd45d7f177da04bb55dfd7@group.calendar.google.com', activo: true },
];

// info_empresa_iguazufalls usa columnas (categoria, informacion).
const COMPANY_INFO: Array<{ categoria: string; informacion: string }> = [
  { categoria: 'nombre',                 informacion: 'IguazuFalls Duplex & Lodge' },
  { categoria: 'descripcion',            informacion: 'Complejo de 11 alojamientos en Puerto Iguazú con piscina central habilitada todo el año, área de descanso y parrilla compartida.' },
  { categoria: 'direccion',              informacion: 'Puerto Iguazú, Misiones, Argentina' },
  { categoria: 'sitio_web',              informacion: 'https://www.iguazufallslodge.com' },
  { categoria: 'contacto',               informacion: 'WhatsApp +54 9 3757 000000 (PLACEHOLDER)' },
  { categoria: 'horarios',               informacion: 'Check-in: 14:00 hs · Check-out: 10:00 hs' },
  { categoria: 'estadia_minima',         informacion: '2 noches (PLACEHOLDER)' },
  { categoria: 'temporadas',             informacion: 'Alta: 15 jun–15 ago | 23 dic–20 feb | 18–21 abr. Media: 21 feb–31 mar. Baja: resto del año.' },
  { categoria: 'extras',                 informacion: 'Toallas y sábanas: $3.000/persona · Garage: $10.000/noche (consultar) · Limpieza: $20.000 (siempre, obligatorio).' },
  { categoria: 'formas_de_pago',         informacion: 'Transferencia bancaria (preferido). Tarjeta crédito/débito vía MercadoPago con 15% recargo (próximamente).' },
  { categoria: 'reservas',               informacion: 'Para confirmar la reserva se requiere el 50% de seña por transferencia bancaria. El operador confirma manualmente al recibir el comprobante.' },
  { categoria: 'banco_titular',          informacion: 'Juan Zapata (PLACEHOLDER)' },
  { categoria: 'banco_cbu',              informacion: '0000000000000000000000 (PLACEHOLDER)' },
  { categoria: 'banco_alias',            informacion: 'iguazufalls.test (PLACEHOLDER)' },
  { categoria: 'banco_nombre',           informacion: 'Banco Galicia (PLACEHOLDER)' },
  { categoria: 'piscina',                informacion: 'Piscina central habilitada todo el año, área de descanso y parrilla.' },
  { categoria: 'idiomas',                informacion: 'Atención en español, inglés y portugués.' },
];

async function ensureSchema() {
  const { error: e1 } = await supa.from('products_iguazufalls').select('nombre').limit(1);
  if (e1) {
    console.error('La tabla products_iguazufalls no responde con el schema esperado:', e1.message);
    process.exit(1);
  }
  const { error: e2 } = await supa.from('info_empresa_iguazufalls').select('categoria').limit(1);
  if (e2) {
    console.error('La tabla info_empresa_iguazufalls no responde con el schema esperado:', e2.message);
    process.exit(1);
  }
}

async function seedCabanas() {
  console.log(`Upserting ${CABANAS.length} cabañas...`);
  const { error } = await supa.from('products_iguazufalls').upsert(CABANAS, { onConflict: 'nombre' });
  if (error) throw error;
  console.log('  ok');
}

async function seedCompany() {
  console.log(`Reemplazando ${COMPANY_INFO.length} entradas de info_empresa_iguazufalls...`);
  // Truncate por seguridad (clave/valor pueden cambiar entre versiones).
  const { error: delErr } = await supa.from('info_empresa_iguazufalls').delete().neq('id', 0);
  if (delErr) throw delErr;
  const { error } = await supa.from('info_empresa_iguazufalls').insert(COMPANY_INFO);
  if (error) throw error;
  console.log('  ok');
}

(async () => {
  await ensureSchema();
  await seedCabanas();
  await seedCompany();
  console.log('Seed completado.');
})().catch((e) => { console.error(e); process.exit(1); });
