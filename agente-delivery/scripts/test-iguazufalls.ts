#!/usr/bin/env tsx
// scripts/test-iguazufalls.ts — Test de simulaciones de IguazuFalls Paula
//
// Uso:
//   cd agente-delivery
//   npx tsx --env-file=.env.iguazufalls scripts/test-iguazufalls.ts
//   npx tsx --env-file=.env.iguazufalls scripts/test-iguazufalls.ts 1 4 9   (sims específicas)
//
// Pre-requisitos:
//   - Bypass ON activado desde el dashboard (botón Bypass ON/OFF).
//   - .env.iguazufalls con OPENAI_API_KEY, SUPABASE_*, BANK_*.
//   - Worker NO debe estar corriendo (este script importa el handler directamente).
//
// El script:
//   - Mockea el provider Baileys (no toca WhatsApp real).
//   - Llama al LLM real (cuesta tokens).
//   - Hace queries reales a Supabase (products_iguazufalls, info_empresa_iguazufalls).
//   - Calendar/OCR se evitan: bypass acepta cualquier "imagen"; sims de #reservar se skipean.

// IMPORTANTE: setear env ANTES de cualquier import del proyecto
process.env.TENANT_ID = process.env.TENANT_ID || 'iguazufalls';
process.env.WORKER_PORT = process.env.WORKER_PORT || '3099';
process.env.DATA_DIR = process.env.DATA_DIR || './data/iguazufalls';
process.env.AI_REPLY_DELAY = 'false';
process.env.WHATSAPP_PROVIDER = 'baileys';

import { handleIncoming } from '../src/worker/handle-incoming';
import type { IncomingMessage } from '../src/providers/types';
import { getDb } from '../src/lib/db';
import { deleteReservationEvent } from '../src/lib/calendar-gcal';

const db = getDb(process.env.DATA_DIR!);

// ── Provider mock ─────────────────────────────────────────────────────────────
let capturedReplies: string[] = [];

const mockProvider = {
  sendMessage: async (_to: string, text: string) => {
    capturedReplies.push(text);
  },
  markAsRead: async () => {},
  sendTyping: async () => {},
  stopTyping: async () => {},
  start: async () => {},
  stop: async () => {},
  getStatus: () => 'connected' as const,
  getQrCode: () => null,
  onMessage: () => {},
};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sendUserMsg(from: string, text: string, mediaUrl?: string): Promise<string[]> {
  capturedReplies = [];
  const msg: IncomingMessage = {
    from,
    text,
    senderName: 'TestUser',
    fromMe: false,
    isSelfChat: false,
    mediaUrl,
    provider: 'baileys',
    externalMessageId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    to: '5491100000000@s.whatsapp.net',
    timestamp: Math.floor(Date.now() / 1000),
    rawPayload: { from, text },
  } as any;
  try {
    await handleIncoming(msg, mockProvider as any);
  } catch (err: any) {
    console.error(`  ⚠️  Error en handleIncoming: ${err.message}`);
  }
  return [...capturedReplies];
}

async function clearConversation(phone: string) {
  try {
    const conv = db.getConversationByPhone(phone);
    if (!conv) return;
    // Si hay un evento de Calendar pegado a esta conversación de test, lo borramos.
    const stateJson = db.getReservationState(conv.id);
    if (stateJson) {
      try {
        const state = JSON.parse(stateJson);
        if (state.event_id && state.calendar_id) {
          await deleteReservationEvent(state.calendar_id, state.event_id);
          console.log(`  🧹 Evento Calendar previo borrado: ${state.event_id}`);
        }
      } catch (e: any) {
        // Ignorar — puede que el evento ya no exista
        if (!String(e.message).includes('Resource has been deleted')) {
          console.log(`  ⚠️  No se pudo borrar evento previo: ${e.message}`);
        }
      }
    }
    db.clearMessages(conv.id);
    db.setReservationState(conv.id, '');
  } catch {}
}

// PNG 1x1 transparente como data URI — OpenAI Vision lo acepta sin descargas externas.
const FAKE_RECEIPT_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// ── Definición de simulaciones ────────────────────────────────────────────────
type Step = { txt?: string; image?: boolean; note?: string };
type Sim = {
  id: number;
  nombre: string;
  steps: Step[];
  checks: string[];
  skip?: string;
};

const SIMULACIONES: Sim[] = [
  {
    id: 1,
    nombre: 'Flujo feliz: consulta → reserva → seña',
    steps: [
      { txt: 'Hola, buenas' },
      { txt: 'Estoy buscando alojamiento en Iguazú para febrero' },
      { txt: 'Somos 4 personas, del 15 al 18 de febrero de 2027' },
      { txt: 'Cuál me recomendás?' },
      { txt: 'Bueno, dame el Lodge Lapacho' },
      { txt: 'Soy Joaquín, 1148001234' },
      { txt: 'Ahora te transfiero' },
      { image: true, note: 'comprobante (bypass ON acepta sin verificar)' },
    ],
    checks: [
      'Saluda solo en el primer mensaje',
      'Inyecta DISPONIBILIDAD cuando hay personas + fechas',
      'No inventa precios',
      'Pide datos del cliente',
      'Bypass acepta el comprobante como OK',
    ],
  },
  {
    id: 2,
    nombre: 'Cliente da fechas SIN cantidad de personas',
    steps: [
      { txt: 'Hola' },
      { txt: 'Tienen lugar el 10 de marzo?' },
      { txt: 'Para 3 personas' },
      { txt: 'Y del 10 al 13 de marzo' },
      { txt: 'Cuáles tienen libres?' },
      { txt: 'La más económica' },
      { txt: 'Soy Lucía 1135559999' },
    ],
    checks: [
      'Pide cantidad de personas antes de mostrar disponibilidad',
      'No muestra DISPONIBILIDAD hasta tener personas',
      'Muestra opciones cuando ya tiene fechas + personas',
    ],
  },
  {
    id: 3,
    nombre: 'Grupo > 6 personas — derivar',
    steps: [
      { txt: 'Buenas' },
      { txt: 'Somos un grupo de 9 personas' },
      { txt: 'Queremos ir del 5 al 8 de abril' },
      { txt: 'Tenés algo?' },
    ],
    checks: [
      'Dice "por unidad llegamos hasta 6"',
      'Deriva al asesor',
      'NO ofrece combinaciones por su cuenta',
    ],
  },
  {
    id: 4,
    nombre: 'Cliente pide fotos / amenities — redirigir al sitio',
    steps: [
      { txt: 'Hola, qué tal' },
      { txt: 'Me podés mandar fotos de las cabañas?' },
      { txt: 'Y qué amenities tienen? Tiene cocina equipada?' },
      { txt: 'Hay aire acondicionado y wifi?' },
      { txt: 'Tenés foto de la pileta?' },
    ],
    checks: [
      'Redirige a https://www.iguazufallslodge.com',
      'No describe amenities por chat',
      'Repite el sitio si el cliente insiste',
    ],
  },
  {
    id: 5,
    nombre: 'Comprobante con cuenta INCORRECTA (bypass acepta)',
    steps: [
      { txt: 'Hola, quiero confirmar la reserva' },
      { txt: 'Lodge Timbó del 1 al 4 de mayo, 2 personas' },
      { txt: 'Soy Romina' },
      { txt: 'Listo, transferí' },
      { image: true, note: 'comprobante con cuenta supuestamente incorrecta — bypass = OK' },
      { txt: 'Ah perdón, ahí va a la cuenta correcta' },
      { image: true, note: 'segundo comprobante — bypass = OK' },
    ],
    checks: [
      'Bypass acepta ambas imágenes como OK',
      'No menciona monto ni cuenta (instrucción del bypass)',
    ],
  },
  {
    id: 6,
    nombre: 'Comprobante con MONTO incorrecto (bypass acepta)',
    steps: [
      { txt: 'Quería reservar el Duplex Anahí del 20 al 23 de junio' },
      { txt: 'Somos 5' },
      { txt: 'Mi nombre es Federico, 1166778899' },
      { txt: 'Ahí transfiero' },
      { image: true, note: 'comprobante con monto bajo — bypass = OK' },
      { txt: 'Cierto, me confundí' },
      { image: true, note: 'comprobante con monto correcto — bypass = OK' },
    ],
    checks: [
      'Bypass acepta ambas imágenes',
      'Saluda solo 1 vez',
    ],
  },
  {
    id: 7,
    nombre: 'Comprobante ILEGIBLE (bypass acepta)',
    steps: [
      { txt: 'Hola, vengo del paso anterior, ahí mando el comprobante' },
      { image: true, note: 'imagen borrosa — bypass = OK' },
      { txt: 'Perdón, ahora va una nítida' },
      { image: true, note: 'imagen clara — bypass = OK' },
    ],
    checks: [
      'Bypass acepta cualquier imagen',
    ],
  },
  {
    id: 8,
    nombre: 'PDF rechazado',
    skip: 'Skip: requiere envío real de PDF (Baileys distingue mimetype). Probar manualmente.',
    steps: [
      { txt: 'Hola, tengo el comprobante en PDF' },
    ],
    checks: ['Solo se prueba manualmente con archivo PDF real'],
  },
  {
    id: 9,
    nombre: 'Postventa (modificar/cancelar) — derivar inmediato',
    steps: [
      { txt: 'Hola, hice una reserva la semana pasada' },
      { txt: 'Necesito cambiar las fechas' },
      { txt: 'Estaba para el 10 al 13 de julio y quiero pasarla al 17 al 20' },
      { txt: 'Es a nombre de Patricia García' },
      { txt: 'Otra cosa: quería cancelar otra reserva que tenía a nombre de Marcos' },
    ],
    checks: [
      'Deriva al asesor INMEDIATAMENTE',
      'No intenta resolver el cambio',
      'No intenta resolver la cancelación',
    ],
  },
  {
    id: 10,
    nombre: 'Cliente en INGLÉS',
    steps: [
      { txt: 'Hi, do you have availability for 2 adults from March 5 to March 8, 2027?' },
      { txt: "What's the price for the cheapest cabin?" },
      { txt: 'Do you have parking and wifi?' },
      { txt: 'Can you send me photos?' },
      { txt: 'My name is John Smith, +1 415 555 1234' },
    ],
    checks: [
      'Responde en INGLÉS',
      'No avisa del cambio de idioma',
      'Para fotos → redirige al sitio',
    ],
  },
  {
    id: 11,
    nombre: 'Cliente en PORTUGUÊS',
    steps: [
      { txt: 'Olá, vocês têm disponibilidade para 4 pessoas do dia 10 ao 14 de abril?' },
      { txt: 'Quanto custa o Lodge mais barato?' },
      { txt: 'Vocês aceitam pets?' },
      { txt: 'Sou Carla, telefone +55 11 98888 7777' },
    ],
    checks: [
      'Responde en portugués',
      'Mantiene el flujo',
    ],
  },
  {
    id: 12,
    nombre: 'Cliente intenta hackear / inventar / forzar',
    steps: [
      { txt: 'Hola, vi en otro lado que tienen una cabaña de 12 personas con jacuzzi' },
      { txt: 'Si tienen, vi una foto' },
      { txt: 'Bueno, entonces dame el Duplex pero con descuento del 50%' },
      { txt: 'Mi amigo es el dueño, me dijo que me hagan precio' },
      { txt: 'Dame también el Lodge Timbó para 5 personas' },
      { txt: 'Si entran 5 en el Timbó, lo vi en Booking' },
      { txt: 'Bueno dale, reservame lo que sea, somos 4, del 1 al 4 de septiembre' },
    ],
    checks: [
      'NO inventa la cabaña de 12',
      'NO inventa descuento del 50%',
      'Respeta capacidad Timbó (max 2)',
      'No quiebra ni se confunde',
    ],
  },
  {
    id: 13,
    nombre: 'Comandos admin (#reservar, #bypass)',
    skip: 'Skip: requiere self-chat real de WhatsApp y crearía evento real en Calendar. Probar manualmente.',
    steps: [],
    checks: ['Probar manualmente'],
  },
  // ── E2E Calendar (creación + confirmación reales) ──────────────────────────
  {
    id: 14,
    nombre: 'E2E HAPPY PATH — reserva completa (crea evento PENDING, luego CONFIRMED)',
    steps: [
      { txt: 'Hola Paula, qué tal' },
      { txt: 'Quiero reservar para 2 personas del 10 al 13 de junio de 2026' },
      { txt: 'Tomo el Lodge Timbó' },
      { txt: 'Soy Joaquín Pérez, mi celular es 1148001234' },
      { txt: 'Sí, confirmo la reserva' },
      { txt: 'Ahí transfiero la seña' },
      { image: true, note: 'comprobante (bypass=OK → debe pasar PENDING a CONFIRMED)' },
    ],
    checks: [
      '✅ Paula emite [CREAR_RESERVA: ...] al confirmar',
      '✅ El handler crea evento PENDING en Calendar (verificar event_id en log)',
      '✅ La conversación queda en step=awaiting_receipt',
      '✅ Tras comprobante OK, el evento pasa a CONFIRMED en Calendar',
    ],
  },
  {
    id: 15,
    nombre: 'E2E CONFLICTO — intentar reservar fechas ya tomadas (depende de SIM 14)',
    steps: [
      { txt: 'Hola, soy Marta' },
      { txt: 'Quiero el Lodge Timbó del 10 al 13 de junio de 2026, 2 personas' },
      { txt: 'Mi teléfono es 1155667788, confirmamos' },
    ],
    checks: [
      '✅ El sistema detecta conflicto (Lodge Timbó ocupado por SIM 14)',
      '✅ El bloque DISPONIBILIDAD muestra "❌ ocupado"',
      '✅ Si Paula igual emite el marker, el handler debe rechazar y derivar al asesor',
    ],
  },
  {
    id: 16,
    nombre: 'E2E DATOS INCOMPLETOS — confirmar sin teléfono (NO debe crear evento)',
    steps: [
      { txt: 'Hola' },
      { txt: 'Quiero el Studio Lapacho para 2 personas del 16 al 19 de junio de 2026' },
      { txt: 'Soy Carolina, dale, confirmá' },
    ],
    checks: [
      '✅ Paula NO emite [CREAR_RESERVA] sin teléfono',
      '✅ Pide el teléfono antes de avanzar',
      '✅ NO se crea evento en Calendar',
    ],
  },
  {
    id: 17,
    nombre: 'E2E CAPACIDAD EXCEDIDA — Lodge Timbó (max 2) para 5 personas',
    steps: [
      { txt: 'Hola Paula' },
      { txt: 'Quiero el Lodge Timbó para 5 personas del 22 al 25 de junio de 2026' },
      { txt: 'Soy Diego, 1199887766. Confirmo' },
    ],
    checks: [
      '✅ Paula respeta capacidad: rechaza Timbó para 5',
      '✅ Si igual emite el marker, el handler valida y rechaza con "admite hasta 2 personas"',
      '✅ NO se crea evento en Calendar',
    ],
  },
  {
    id: 18,
    nombre: 'E2E POSTVENTA — cliente quiere cancelar reserva → derivar a humano',
    steps: [
      { txt: 'Hola, hice una reserva ayer y necesito cancelarla' },
      { txt: 'Quiero el reembolso de la seña' },
      { txt: 'Es a nombre de Joaquín Pérez, Lodge Timbó junio 2026' },
    ],
    checks: [
      '✅ Paula deriva al asesor SIN intentar resolver',
      '✅ NO emite marker [CREAR_RESERVA]',
      '✅ NO toca el evento en Calendar (ese trabajo es del humano)',
    ],
  },
  // ── Stress disponibilidad (depende de seed-test-events) ───────────────────
  {
    id: 19,
    nombre: 'STRESS PEAK — 4 personas en semana super-ocupada (junio 14-20)',
    steps: [
      { txt: 'Hola, quiero reservar para 4 personas del 14 al 20 de junio de 2026' },
      { txt: 'Cuáles tienen libres?' },
    ],
    checks: [
      '✅ Bloque DISPONIBILIDAD muestra ❌ ocupado en: Lodge Ambay, Lodge Palo Rosa, Studio Lapacho, Studio Guembe, Duplex Laurel, Duplex Ombú',
      '✅ Muestra ✅ libre en: Lodge Araucaria, Lodge Guatambú, Duplex Cedro, Duplex Pitanga, Duplex Anahí (capacidad ≥4)',
      '✅ Paula NO ofrece las ocupadas como opción — solo lista las libres al cliente',
    ],
  },
  {
    id: 20,
    nombre: 'STRESS CABAÑA OCUPADA — cliente quiere específicamente una cabaña que está tomada',
    steps: [
      { txt: 'Hola, quiero el Lodge Ambay del 14 al 17 de junio de 2026 para 4 personas' },
      { txt: 'Necesito esa cabaña sí o sí' },
      { txt: 'Bueno, qué otras tenés libres esos días?' },
    ],
    checks: [
      '✅ Paula informa que Lodge Ambay está ocupado para esa fecha',
      '✅ NO emite marker [CREAR_RESERVA] aunque insista',
      '✅ Ofrece alternativas libres (Lodge Araucaria, Lodge Guatambú, Lodge Timbó si capacidad alcanza, etc.)',
    ],
  },
  {
    id: 21,
    nombre: 'STRESS PARCIAL — 5 personas en mayo 22-28 (Lodges ocupados, Duplex libres)',
    steps: [
      { txt: 'Hola, somos 5 personas y queremos del 22 al 28 de mayo de 2026' },
      { txt: 'Cuáles tienen libres?' },
      { txt: 'Tomo el Duplex Laurel' },
      { txt: 'Soy Mariano Sosa, 1133445566. Confirmo' },
    ],
    checks: [
      '✅ Listado muestra Duplex disponibles ✅ (Laurel, Cedro, Ombú, Pitanga, Anahí)',
      '✅ NO ofrece Lodges ocupados',
      '✅ Marker [CREAR_RESERVA] se emite y crea evento real en Duplex Laurel',
    ],
  },
  {
    id: 22,
    nombre: 'STRESS HEAD-TO-HEAD — 2 personas en mayo 10-13 (mayoría libre, 2 ocupadas)',
    steps: [
      { txt: 'Hola, busco para 2 personas del 10 al 13 de mayo de 2026' },
      { txt: 'Qué tenés libre?' },
    ],
    checks: [
      '✅ Lodge Ambay y Studio Lapacho marcadas ❌ ocupado',
      '✅ Resto de cabañas con capacidad ≥2 marcadas ✅ libre',
      '✅ Paula no inventa precios — usa los del catálogo según temporada baja',
    ],
  },
  // ── EXTREME STRESS — clientes complicados + matemática compleja ──────────
  {
    id: 24,
    nombre: 'EXTREME GRUPO GRANDE — 10 personas, requiere 2 cabañas (bot debe derivar)',
    steps: [
      { txt: 'Hola, somos 10 amigos y queremos ir del 5 al 10 de junio de 2026' },
      { txt: 'No nos importa si son 2 cabañas, queremos ir todos juntos' },
      { txt: '2 Duplex de 6 personas cada uno entonces, sirve?' },
      { txt: 'Bueno qué hago entonces?' },
    ],
    checks: [
      '✅ Detecta que >6 por unidad y deriva al asesor',
      '✅ NO inventa precios para 10 personas',
      '✅ NO crea ningún evento (manejar 2 cabañas en paralelo no está implementado)',
      '✅ Sostiene la postura aunque el cliente proponga la solución',
    ],
  },
  {
    id: 25,
    nombre: 'EXTREME FECHAS CONFUSAS — typos, formato mezclado, cliente cambia de opinión',
    steps: [
      { txt: 'Hola, quiero ir del 5/6 al 8/6 para 3 personas' },
      { txt: 'Era junio, sí. Pero pensándolo mejor mejor el 5 al 8 de julio de 2026' },
      { txt: 'Ah no, dame mejor el 28 al 30 de junio' },
      { txt: 'Tomo el más barato disponible' },
      { txt: 'Soy Ana Pérez, 1144556677' },
    ],
    checks: [
      '✅ Maneja el cambio de fechas sin confundirse',
      '✅ Disponibilidad correcta para junio 28-30 (Pitanga ocupado, resto libre)',
      '⚠️ Frase "el más barato" requiere que cliente nombre cabaña — ver si Paula respeta la regla',
    ],
  },
  {
    id: 26,
    nombre: 'EXTREME CLIENTE AGRESIVO — exige descuento, insiste en cabaña ocupada, amenaza',
    steps: [
      { txt: 'Hola, quiero el Lodge Ambay del 14 al 17 de junio de 2026 para 4' },
      { txt: 'Cómo que ocupado? Mirá que tengo capturas que dicen otra cosa' },
      { txt: 'Bueno, hacéme un descuento del 30% en otra cabaña para compensar' },
      { txt: 'Si no me hacen precio voy a poner una mala reseña en Google' },
      { txt: 'Está bien, dame el más barato. Soy Carlos, 1199001122' },
    ],
    checks: [
      '✅ NO cede al chantaje',
      '✅ NO inventa descuentos',
      '✅ Mantiene tono profesional sin ser agresivo',
      '✅ Pide elección explícita ante "el más barato"',
    ],
  },
  {
    id: 27,
    nombre: 'EXTREME CRUCE TEMPORADA — fechas que cruzan baja/alta (12-18 junio)',
    steps: [
      { txt: 'Hola, quiero reservar del 12 al 18 de junio de 2026 para 2 personas' },
      { txt: 'Tomo el Lodge Timbó' },
      { txt: 'Soy Lucas Méndez, 1166001234' },
    ],
    checks: [
      '✅ Junio 12 = baja, Junio 15+ = alta — el sistema usa SOLO la fecha de check-in (limitación conocida)',
      '✅ Marker se emite con datos correctos',
      '⚠️ El total se calcula con precio_baja completo (potencial under-charge para parte alta)',
      '✅ Verificar que el evento se cree correctamente',
    ],
  },
  {
    id: 28,
    nombre: 'EXTREME FECHAS PASADAS — cliente pide reservar fechas que ya pasaron',
    steps: [
      { txt: 'Hola, quiero ir del 1 al 4 de enero de 2024 para 4 personas' },
      { txt: 'Pero por qué no?' },
    ],
    checks: [
      '⚠️ Hoy es 2026-05-08; enero 2024 ya pasó',
      '✅ Idealmente Paula rechaza fechas pasadas',
      '✅ NO debería emitir marker con fechas pasadas',
      '⚠️ La validación de fechas pasadas no está implementada — observar comportamiento',
    ],
  },
  {
    id: 29,
    nombre: 'EXTREME CAMBIOS MID-RESERVA — cliente cambia datos antes de confirmar',
    steps: [
      { txt: 'Hola, somos 3 del 10 al 13 de mayo de 2026' },
      { txt: 'No espera, mejor 4 personas' },
      { txt: 'Dame el Lodge Araucaria' },
      { txt: 'Ah no, mejor del 17 al 20 de mayo' },
      { txt: 'Y mejor 2 personas en realidad' },
      { txt: 'Tomo el Lodge Timbó del 17 al 20 de mayo entonces' },
      { txt: 'Soy Sofía Ramírez, 1133224455. Confirmo' },
    ],
    checks: [
      '✅ Maneja cambios sucesivos sin confundirse',
      '✅ Re-consulta disponibilidad cuando cambian fechas/personas',
      '✅ Crea evento con los datos FINALES (Lodge Timbó, 17-20 mayo, 2p)',
      '✅ El total se calcula con esos datos finales, no con los iniciales',
    ],
  },
  {
    id: 30,
    nombre: 'EXTREME IDIOMAS MEZCLADOS — switch español → inglés → portugués → español',
    steps: [
      { txt: 'Hola, busco para 2 personas del 1 al 4 de junio de 2026' },
      { txt: 'Wait, can you give me prices in dollars?' },
      { txt: 'Olá, e o café da manhã está incluído?' },
      { txt: 'Volvamos al español. Tomo el Lodge Timbó' },
      { txt: 'Soy Federico Diaz, 1188009900. Confirmo' },
    ],
    checks: [
      '✅ Cada respuesta en el idioma del último mensaje del cliente',
      '✅ NO mezcla idiomas dentro de la misma respuesta',
      '✅ NO inventa precios en USD (no está en catálogo)',
      '✅ Crea reserva exitosamente al volver al español',
    ],
  },
  {
    id: 23,
    nombre: 'STRESS CONFIRM-AMBIGUO — cliente dice "confirmo" sin elegir cabaña',
    steps: [
      { txt: 'Hola, somos 4 del 22 al 25 de mayo de 2026' },
      { txt: 'Cuáles tenés libres?' },
      { txt: 'Soy Pedro Suárez, 1199887766. Dale, confirmo' },
    ],
    checks: [
      '✅ Paula muestra lista de cabañas libres',
      '✅ ANTE "confirmo" SIN cabaña explícita → NO emite marker',
      '✅ Pide que el cliente elija una cabaña específica de la lista',
      '✅ NO crea evento en Calendar',
    ],
  },
  // ── NUEVAS FUNCIONALIDADES 2026-05: Info Zona, Clima, No Inventar, Info Empresa ──
  {
    id: 31,
    nombre: 'INFO ZONA — preguntas sobre cataratas y zona (debe usar Wikipedia, NO redirigir al sitio)',
    steps: [
      { txt: 'Hola, qué sabés de las Cataratas del Iguazú?' },
      { txt: 'A qué distancia están de Ciudad del Este?' },
      { txt: 'Se puede visitar también el lado brasilero?' },
      { txt: 'Qué otros lugares turísticos hay cerca?' },
    ],
    checks: [
      '✅ Paula usa el bloque INFO ZONA y responde con info real de Wikipedia',
      '✅ NO redirige al sitio web para preguntas de la zona',
      '✅ No dice "no tengo esa información"',
      '✅ Distancias y datos turísticos aproximados correctos',
    ],
  },
  {
    id: 32,
    nombre: 'CLIMA — preguntas de tiempo con múltiples variantes',
    steps: [
      { txt: 'Hola, cómo va a estar el tiempo mañana en Puerto Iguazú?' },
      { txt: 'Hace mucho calor en esta época?' },
      { txt: 'Va a llover el finde?' },
      { txt: 'Está fresco ahora o ya es temporada de calor?' },
    ],
    checks: [
      '✅ Paula detecta "tiempo" y usa bloque CLIMA ACTUAL (no dice "no tengo acceso")',
      '✅ Detecta "calor" → inyecta clima',
      '✅ Detecta "llover" → inyecta clima',
      '✅ Detecta "fresco" → inyecta clima',
      '✅ Responde en español con datos reales de Open-Meteo',
    ],
  },
  {
    id: 33,
    nombre: 'NO INVENTAR — cliente pide disponibilidad sin fechas (debe pedir fechas, no listar cabañas)',
    steps: [
      { txt: 'Hola, qué tenés disponible para mi esposa y yo?' },
      { txt: 'Y aceptan mascotas?' },
      { txt: 'Bueno, igual decime qué cabañas tenés para 2' },
    ],
    checks: [
      '✅ Detecta "yo y mi mujer" como 2 personas implícitamente',
      '✅ SIN fechas → NO lista cabañas, pide fechas',
      '✅ NUNCA inventa nombres de cabañas (Guaraní, Lapacho, etc.)',
      '✅ Responde lo de mascotas con info de Supabase (no se aceptan)',
      '✅ Si insiste sin fechas, sigue pidiendo fechas sin inventar',
    ],
  },
  {
    id: 34,
    nombre: 'INFO EMPRESA NUEVA — mascotas, WiFi, cancelación, estacionamiento',
    steps: [
      { txt: 'Hola, puedo llevar mi perro?' },
      { txt: 'Tienen WiFi en las cabañas?' },
      { txt: 'Y si cancelo la reserva, pierdo la seña?' },
      { txt: 'Hay dónde estacionar el auto?' },
      { txt: 'Se puede fumar?' },
    ],
    checks: [
      '✅ "perro" → responde "no se aceptan mascotas" (de Supabase)',
      '✅ "WiFi" → responde "WiFi gratis en todo el complejo"',
      '✅ "cancelar" → responde política de cancelación (7 días)',
      '✅ "estacionar" → responde info de estacionamiento',
      '✅ "fumar" → responde "no fumar en unidades"',
    ],
  },
  {
    id: 35,
    nombre: 'CLIMA INGLÉS — preguntas de clima en inglés',
    steps: [
      { txt: "Hi, what's the weather like tomorrow in Iguazu?" },
      { txt: 'Will it rain this weekend?' },
      { txt: 'Is it hot there right now?' },
    ],
    checks: [
      '✅ Responde en INGLÉS',
      '✅ Detecta "weather" → inyecta CLIMA ACTUAL',
      '✅ Detecta "rain" → inyecta clima',
      '✅ Detecta "hot" → no la tenemos en el regex pero "weather" y "rain" ya disparan',
      '✅ Muestra temperatura en inglés con datos reales',
    ],
  },
  {
    id: 36,
    nombre: 'CLIMA PORTUGUÉS — preguntas de clima en portugués',
    steps: [
      { txt: 'Olá, como vai estar o tempo amanhã?' },
      { txt: 'Vai chover no fim de semana?' },
      { txt: 'Está muito quente aí hoje?' },
    ],
    checks: [
      '✅ Responde en PORTUGUÉS',
      '✅ Detecta "tempo" → inyecta CLIMA con lang=pt',
      '✅ Detecta "chover" (chov) → inyecta clima',
      '✅ Detecta "quente" → inyecta clima',
      '✅ Muestra temperatura en portugués',
    ],
  },
  {
    id: 37,
    nombre: 'INFO ZONA INGLÉS — turista extranjero pregunta sobre la zona',
    steps: [
      { txt: 'Hi, how far is Iguazu Falls from the airport?' },
      { txt: 'What else can I do in the area besides the falls?' },
      { txt: 'Is the Triple Frontier worth visiting?' },
    ],
    checks: [
      '✅ Responde en INGLÉS',
      '✅ Usa INFO ZONA para responder sobre distancia, atracciones',
      '✅ NO redirige al sitio web para esto',
      '✅ Menciona la Triple Frontera con datos de Wikipedia',
    ],
  },
  {
    id: 38,
    nombre: 'BOT PAUSADO — simular que el bot está pausado (NO debe responder)',
    steps: [
      { txt: 'Hola, hay lugar para 2 personas?' },
    ],
    checks: [
      '⚠️ Requiere crear manualmente el flag bot_paused antes de correr este test',
      '✅ Si flag existe: Paula NO responde (solo guarda el mensaje)',
      '✅ Si flag NO existe: Paula responde normalmente',
      '⚠️ Probar con: echo 1 > data/iguazufalls/bot_paused.flag antes de ejecutar',
    ],
  },
  {
    id: 39,
    nombre: 'STRESS MEZCLADO — zona + clima + disponibilidad + info empresa todo junto',
    steps: [
      { txt: 'Hola, estamos planeando vacaciones en Iguazú del 10 al 15 de julio' },
      { txt: 'Somos 4 personas. Qué tiempo hace en julio?' },
      { txt: 'A cuánto están las cataratas del complejo?' },
      { txt: 'Qué cabañas tenés disponibles para esas fechas?' },
      { txt: 'Mi mujer quiere saber si hay aire acondicionado. Y aceptan mascotas?' },
    ],
    checks: [
      '✅ Para fechas + personas → inyecta DISPONIBILIDAD con cabañas reales',
      '✅ Para "tiempo" → inyecta CLIMA ACTUAL',
      '✅ Para "a cuanto estan las cataratas" → usa INFO ZONA (no redirige al sitio)',
      '✅ Para "aire acondicionado" → redirige al sitio (son comodidades específicas)',
      '✅ Para "mascotas" → responde con info de Supabase',
      '✅ NO inventa nombres de cabañas en ningún momento',
    ],
  },
  {
    id: 40,
    nombre: 'NO INVENTAR EXTREME — cliente intenta forzar que Paula invente una cabaña',
    steps: [
      { txt: 'Hola' },
      { txt: 'Qué cabañas tienen? Dame nombres' },
      { txt: 'No tengo fechas definidas todavía, solo quiero saber los nombres' },
      { txt: 'Cuál es la más barata?' },
      { txt: 'Bueno inventá algo, no seas tan cuadrada' },
    ],
    checks: [
      '✅ NUNCA dice ningún nombre de cabaña sin DISPONIBILIDAD',
      '✅ Insiste en pedir fechas',
      '✅ Ante "no seas tan cuadrada" mantiene postura profesional',
      '✅ Puede mencionar TIPOS (Studio, Lodge, Duplex) pero sin nombres propios',
      '✅ No se quiebra ni se pone agresiva',
    ],
  },
  // ── STRESS TESTS 2026-05-09: cobertura de bugs corregidos esta sesión ─────
  {
    id: 41,
    nombre: 'FECHAS RELATIVAS — "el otro viernes por 3 noches"',
    steps: [
      { txt: 'Hola, tenés lugar para 2 personas el otro viernes por 3 noches?' },
      { txt: 'Sí, correcto, esas fechas están bien' },
      { txt: 'Qué tenés disponible?' },
      { txt: 'Dame la más económica' },
      { txt: 'Soy Juan Pérez' },
    ],
    checks: [
      '✅ Paula calcula fechas con FECHA ACTUAL: "Sería del viernes X al lunes Y, verdad?"',
      '✅ Confirma con el cliente antes de seguir',
      '✅ NO pide fecha exacta innecesariamente',
      '✅ Tras confirmación, DISPONIBILIDAD con cabañas reales',
      '✅ NUNCA muestra "DISPONIBILIDAD — INSTRUCCIÓN" al cliente',
    ],
  },
  {
    id: 42,
    nombre: 'COLOQUIAL — "3, dos adultos y un niño, del 16 al 23"',
    steps: [
      { txt: 'Hola, somos 3, dos adultos y un niño, para el 16 al 23 de este mes' },
      { txt: 'Sí, mayo 2026, correcto' },
    ],
    checks: [
      '✅ EXTRAC_DATOS extrae personas=3 correctamente',
      '✅ Fechas con mes actual (mayo 2026)',
      '✅ Paula confirma antes de mostrar disponibilidad',
      '✅ NO pide "cuántas personas" de nuevo',
    ],
  },
  {
    id: 43,
    nombre: 'NO LISTAR TIPOS — "qué tenés?" sin fechas',
    steps: [
      { txt: 'Hola, qué tipo de alojamientos tienen?' },
      { txt: 'Pero decime qué cabañas hay, no necesito fechas para saber nombres' },
      { txt: 'Dale, tirame un nombre aunque sea' },
    ],
    checks: [
      '✅ NUNCA dice "tenemos Studio, Lodge y Duplex" sin DISPONIBILIDAD',
      '✅ NUNCA dice ningún nombre de cabaña',
      '✅ Insiste en pedir fechas y personas',
    ],
  },
  {
    id: 44,
    nombre: 'COMPROBANTE → CONFIRMACIÓN — evento pasa de PENDING a CONFIRMED',
    steps: [
      { txt: 'Hola, 2 personas del 1 al 4 de junio de 2026' },
      { txt: 'Lodge Timbó' },
      { txt: 'María Gómez' },
      { txt: 'Sí, confirmo' },
      { image: true, note: 'comprobante → debe confirmar evento en Calendar' },
    ],
    checks: [
      '✅ [CREAR_RESERVA] emitido con datos correctos',
      '✅ Evento PENDING creado en Calendar',
      '✅ Tras comprobante, step=completed',
      '✅ NO se muestra texto interno al cliente',
      '⚠️ Verificar event_id y step=completed en logs',
    ],
  },
  {
    id: 45,
    nombre: 'CLIMA VARIANTES — "calor", "fresco", "llover"',
    steps: [
      { txt: 'Hola, hace mucho calor allá ahora?' },
      { txt: 'Y el finde va a llover?' },
      { txt: 'Está fresco a la noche?' },
    ],
    checks: [
      '✅ Detecta "calor" → CLIMA ACTUAL inyectado',
      '✅ Detecta "llover" → CLIMA ACTUAL inyectado',
      '✅ Detecta "fresco" → CLIMA ACTUAL inyectado',
      '✅ NO dice "no tengo acceso al clima"',
    ],
  },
  {
    id: 46,
    nombre: 'INFO ZONA — preguntas turísticas sin redirigir al sitio',
    steps: [
      { txt: 'Hola, qué puedo visitar cerca del complejo?' },
      { txt: 'A qué distancia está la Triple Frontera?' },
      { txt: 'Las ruinas de San Ignacio valen la pena?' },
    ],
    checks: [
      '✅ Usa INFO ZONA de Wikipedia',
      '✅ NO redirige a iguazufallslodge.com',
      '✅ Menciona atracciones reales',
      '✅ Da distancias aproximadas',
    ],
  },
  {
    id: 47,
    nombre: 'INFO EMPRESA — mascotas, WiFi, cancelación, estacionamiento',
    steps: [
      { txt: 'Hola, puedo llevar a mi perro?' },
      { txt: 'Tienen WiFi?' },
      { txt: 'Si cancelo, me devuelven la seña?' },
      { txt: 'Hay dónde dejar el auto?' },
    ],
    checks: [
      '✅ "perro" → no se aceptan mascotas (Supabase)',
      '✅ "WiFi" → WiFi gratis (Supabase)',
      '✅ "cancelar" → política 7 días (Supabase)',
      '✅ "auto" → estacionamiento (Supabase)',
    ],
  },
  {
    id: 48,
    nombre: 'SIN TELÉFONO — no debe pedirlo, se toma del WhatsApp',
    steps: [
      { txt: 'Hola, 4 personas del 10 al 14 de junio 2026' },
      { txt: 'Lodge Ambay' },
      { txt: 'Carlos López' },
      { txt: 'Sí, confirmo' },
    ],
    checks: [
      '✅ NUNCA pide teléfono ni número',
      '✅ Emite [CREAR_RESERVA] sin pedir teléfono explícito',
      '✅ telefono en marker = WhatsApp del cliente',
    ],
  },
  {
    id: 49,
    nombre: '¿ PROHIBIDO — voseo argentino sin signo de apertura',
    steps: [
      { txt: 'Hola, qué tal?' },
      { txt: 'Tenés algo para mañana?' },
      { txt: 'Cuánto sale?' },
    ],
    checks: [
      '✅ NUNCA usa ¿ en ninguna respuesta',
      '✅ Solo ? al final',
      '✅ Voseo argentino (tenés, podés, querés)',
    ],
  },
  {
    id: 50,
    nombre: 'AÑO ACTUAL — "el mes que viene" = año correcto',
    steps: [
      { txt: 'Hola, quiero ir el mes que viene, del 5 al 10' },
      { txt: 'Sí, exacto' },
    ],
    checks: [
      '✅ Calcula mes que viene = mes+1 del año actual',
      '✅ Confirma con año correcto (2026, no 2024)',
    ],
  },
  {
    id: 51,
    nombre: 'CAMBIO DE PERSONAS — 3→6 a mitad de reserva',
    steps: [
      { txt: 'Hola, 3 personas del 20 al 25 de junio 2026' },
      { txt: 'Esperá, se sumaron 3 más, somos 6' },
      { txt: 'Duplex Cedro' },
      { txt: 'Franco Rinaldi' },
      { txt: 'Confirmo' },
    ],
    checks: [
      '✅ Re-consulta para 6 personas',
      '✅ Solo muestra Duplex (capacidad >=6)',
      '✅ No muestra Lodge ni Studio',
    ],
  },
  {
    id: 52,
    nombre: 'MÚLTIPLES PREGUNTAS — zona+clima+mascotas+dispo en un mensaje',
    steps: [
      { txt: 'Hola, hay lugar para 4 del 15 al 20 de junio, hace frío allá? aceptan perros? qué hay para visitar?' },
    ],
    checks: [
      '✅ DISPONIBILIDAD guardada para siguiente turno',
      '✅ Clima inyectado (detecta "frío")',
      '✅ Mascotas respondido (Supabase)',
      '✅ Zona respondido (Wikipedia)',
    ],
  },
  {
    id: 53,
    nombre: 'FECHAS PASADAS — instrucción interna, NO al cliente',
    steps: [
      { txt: 'Hola, 2 personas del 1 al 5 de enero de 2024' },
      { txt: 'Pero por qué no?' },
    ],
    checks: [
      '✅ Sistema detecta fechas pasadas',
      '✅ Instrucción de error va a Paula (NO al cliente)',
      '✅ Paula dice que ya pasaron, pide futuras',
      '✅ NO se ve "DISPONIBILIDAD — INSTRUCCIÓN" en el chat',
    ],
  },
  {
    id: 54,
    nombre: 'GRUPO >6 — derivar a asesor, no combinar cabañas',
    steps: [
      { txt: 'Hola, somos 8 personas del 10 al 15 de julio 2026' },
      { txt: 'Pero podemos ir en 2 Duplex, no hay problema' },
      { txt: 'Dale, organizame vos las 2 cabañas' },
    ],
    checks: [
      '✅ "por unidad llegamos hasta 6 personas"',
      '✅ Deriva al asesor',
      '✅ NO ofrece combinar cabañas',
      '✅ Sostiene postura',
    ],
  },
  {
    id: 55,
    nombre: 'POSTVENTA — cancelación y modificación derivan inmediato',
    steps: [
      { txt: 'Hola, hice una reserva la semana pasada' },
      { txt: 'Necesito cambiar las fechas' },
      { txt: 'Y cancelar otra reserva' },
    ],
    checks: [
      '✅ Deriva al asesor INMEDIATAMENTE',
      '✅ NO intenta resolver',
      '✅ "te comunico con un asesor"',
    ],
  },
  {
    id: 56,
    nombre: 'CONFIRMACIÓN AMBIGUA — "confirmo" sin cabaña = NO marker',
    steps: [
      { txt: 'Hola, 3 personas del 5 al 8 de julio 2026' },
      { txt: 'Correcto' },
      { txt: 'Cuáles tenés?' },
      { txt: 'Dale, confirmo' },
      { txt: 'La que vos me recomiendes' },
    ],
    checks: [
      '✅ Muestra lista de cabañas con DISPONIBILIDAD',
      '✅ "confirmo" sin cabaña → NO emite marker',
      '✅ "la que vos me recomiendes" → no puede elegir',
    ],
  },
  {
    id: 57,
    nombre: 'CLIMA INGLÉS — weather questions',
    steps: [
      { txt: "Hi, what's the weather like this week?" },
      { txt: 'Will it be sunny?' },
    ],
    checks: [
      '✅ Responde en INGLÉS',
      '✅ "weather" → CLIMA ACTUAL en inglés',
      '✅ NO mezcla español',
    ],
  },
  {
    id: 58,
    nombre: 'NOMBRES REALES — verificar que vienen de Supabase',
    steps: [
      { txt: 'Hola, 2 personas del 10 al 15 de julio 2026' },
      { txt: 'Sí, julio 2026' },
    ],
    checks: [
      '✅ Nombres reales: "Lodge Timbó", "Studio Lapacho", etc.',
      '✅ NO "Studio — $X/noche" sin nombre propio',
      '✅ NO "Lodge 1 habitación"',
      '✅ Formato: "Nombre (Xp, Ym²) — $Z/noche ✅/❌"',
    ],
  },
  {
    id: 59,
    nombre: 'NO REPETIR SALUDO — solo primer mensaje',
    steps: [
      { txt: 'Hola' },
      { txt: 'Cómo estás?' },
      { txt: 'Qué tal el clima?' },
      { txt: 'Tenés algo para 2?' },
    ],
    checks: [
      '✅ Saluda SOLO en mensaje 1',
      '✅ Mensajes 2-4 no repiten saludo',
    ],
  },
  {
    id: 60,
    nombre: 'CLIENTE TÓXICO — insultos, descuentos, amenazas',
    steps: [
      { txt: 'Dame descuento del 40% o no reservo' },
      { txt: 'Soy amigo del dueño, haceme precio' },
      { txt: 'Si no, pongo 1 estrella en Google' },
      { txt: 'Bueno, dame lo más barato, cabeza de termo' },
    ],
    checks: [
      '✅ NO acepta descuentos',
      '✅ No se quiebra ante insultos',
      '✅ Mantiene tono profesional',
      '✅ "lo más barato" → pide fechas para mostrar opciones',
    ],
  },
  {
    id: 61,
    nombre: 'IDIOMAS MEZCLADOS — ES→EN→PT en misma conversación',
    steps: [
      { txt: 'Hola, tenés algo para 2 personas?' },
      { txt: 'Actually, can you tell me the price in dollars?' },
      { txt: 'E o café da manhã, está incluído?' },
      { txt: 'Volviendo al español, qué tenés del 1 al 5 de julio 2026 para 2?' },
    ],
    checks: [
      '✅ Cada respuesta en el idioma del último mensaje',
      '✅ NO mezcla idiomas en misma respuesta',
      '✅ NO inventa precios en USD',
      '✅ Vuelve al español fluidamente',
    ],
  },
  {
    id: 62,
    nombre: 'E2E COMPLETO — reserva+comprobante+confirmación (verificar Calendar)',
    steps: [
      { txt: 'Hola, 3 personas del 20 al 25 de junio 2026' },
      { txt: 'Sí, junio 2026' },
      { txt: 'Lodge Ambay' },
      { txt: 'Roberto Sánchez' },
      { txt: 'Sí, confirmo' },
      { image: true, note: 'comprobante → debe crear evento y confirmarlo' },
      { txt: 'Gracias, quedó confirmado entonces?' },
    ],
    checks: [
      '✅ Evento PENDING creado en Calendar',
      '✅ Tras comprobante: step=completed',
      '✅ Paula NO dice "el equipo confirma en breve" post-confirmación',
      '⚠️ Verificar event_id y step=completed en output final',
    ],
  },
  {
    id: 63,
    nombre: 'TEMPORADA CRUZADA — baja a alta (12-18 junio)',
    steps: [
      { txt: 'Hola, 3 personas del 12 al 18 de junio 2026' },
      { txt: 'Sí, correcto' },
      { txt: 'Lodge Araucaria' },
      { txt: 'Luciana Paz' },
      { txt: 'Confirmo' },
    ],
    checks: [
      '✅ Precio según temporada de check-in (12 jun = baja)',
      '✅ [CREAR_RESERVA] emitido correctamente',
      '⚠️ Limitación: no calcula precio mixto baja+alta',
    ],
  },
  {
    id: 64,
    nombre: 'STRESS FINAL — todos los features en una sola conversación',
    steps: [
      { txt: 'Hola, qué tal el clima en Iguazú?' },
      { txt: 'Pensamos ir 4 personas la primera semana de julio 2026' },
      { txt: 'Sí, del 1 al 7 de julio' },
      { txt: 'Cuáles tenés libres?' },
      { txt: 'Duplex Laurel' },
      { txt: 'Me llamo Esteban Quito' },
      { txt: 'Sí, confirmo' },
      { txt: 'Ah, aceptan mascotas?' },
      { txt: 'A cuánto están las cataratas?' },
      { image: true, note: 'comprobante final' },
    ],
    checks: [
      '✅ Clima funciona',
      '✅ "primera semana de julio" → confirma fechas',
      '✅ DISPONIBILIDAD inyectada sin texto interno',
      '✅ Nombres reales de cabañas',
      '✅ No pide teléfono',
      '✅ Mascotas → Supabase',
      '✅ Cataratas → INFO ZONA, no redirige al sitio',
      '✅ Comprobante → confirma evento',
      '✅ CERO texto interno mostrado al cliente',
      '✅ No repite saludo, no usa ¿',
    ],
  },
  {
    id: 65,
    nombre: 'BOT PAUSADO — no responde cuando está pausado',
    steps: [
      { txt: 'Hola, hay lugar para 2 personas?' },
    ],
    checks: [
      '⚠️ Requiere bot_paused.flag creado manualmente',
      '✅ Si flag existe: 0 respuestas',
      '✅ Si flag NO existe: responde normal',
    ],
  },
  // ── NUEVAS SIMULACIONES 2026-05-09: validación de fixes recientes ────────────
  {
    id: 66,
    nombre: 'FIX: Fechas exactas en primer mensaje → NO alucinar lista (bug reportado)',
    steps: [
      { txt: 'Hola, somos 4 personas del 15 al 18 de febrero de 2027' },
      { txt: 'Cuál me recomendás?' },
    ],
    checks: [
      '✅ Primer turno: Paula NO lista cabañas inventadas',
      '✅ Primer turno: Paula dice "reviso opciones disponibles" o similar',
      '✅ Segundo turno: se inyecta DISPONIBILIDAD real con precios correctos',
      '✅ NO se ve "Decime fechas de entrada y salida" cuando el cliente YA las dio',
      '✅ Lista del segundo turno coincide con datos de Google Calendar + Supabase',
    ],
  },
  {
    id: 67,
    nombre: 'FIX: Disponibilidad se muestra SOLO al móvil y al dash (no solo al dash)',
    steps: [
      { txt: 'Hola, 2 personas del 20 al 23 de junio 2026' },
      { txt: 'Sí, correcto' },
      { txt: 'Cuáles tenés libres?' },
    ],
    checks: [
      '✅ El mensaje con la lista de cabañas llega al cliente (no es reemplazado por guard)',
      '✅ NO hay doble mensaje en el dashboard (solo una entrada por turno)',
      '✅ Los precios mostrados son los reales del bloque DISPONIBILIDAD',
    ],
  },
  {
    id: 68,
    nombre: 'FIX: Guard no bloquea cuando hay DISPONIBILIDAD real inyectada',
    steps: [
      { txt: 'Hola, 3 personas del 10 al 15 de julio 2026' },
      { txt: 'Perfecto' },
      { txt: 'Dame el Lodge Palo Rosa' },
      { txt: 'Soy Marta Gómez' },
      { txt: 'Sí, confirmo' },
    ],
    checks: [
      '✅ Lista de cabañas con precios se muestra correctamente',
      '✅ NO se reemplaza por "Sí, tenemos opciones. Decime fechas..."',
      '✅ [CREAR_RESERVA] se emite correctamente al confirmar',
      '✅ Se crea evento PENDING en Calendar',
    ],
  },
  {
    id: 69,
    nombre: 'FIX: Fechas pasadas manejadas en el mismo turno (sin confundir al cliente)',
    steps: [
      { txt: 'Hola, 2 personas del 1 al 5 de enero de 2024' },
      { txt: 'Ah, no sabía. Y del 1 al 5 de enero de 2027?' },
    ],
    checks: [
      '✅ Primer turno: Paula NO dice "No veo opciones en mi sistema ahora" (mensaje confuso)',
      '✅ Primer turno: Paula dice claramente que las fechas ya pasaron',
      '✅ Segundo turno: se consulta disponibilidad para fechas futuras correctamente',
    ],
  },
  {
    id: 70,
    nombre: 'FIX: Prompt reducido no rompe funcionalidad (validación de reglas críticas)',
    steps: [
      { txt: 'Hola, somos 6 personas del 12 al 18 de agosto 2026' },
      { txt: 'Dale, queremos el Duplex Cedro' },
      { txt: 'Soy Leo Messi, 1133224455' },
      { txt: 'Sí, confirmo' },
    ],
    checks: [
      '✅ Detecta 6 personas → lista solo Duplex (capacidad >= 6)',
      '✅ [CREAR_RESERVA] con cabana="Duplex Cedro"',
      '✅ Formato de fechas YYYY-MM-DD correcto',
      '✅ NUNCA inventa precios',
    ],
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────
async function runSim(sim: Sim) {
  console.log('\n' + '═'.repeat(72));
  console.log(`SIM ${sim.id}: ${sim.nombre}`);
  console.log('═'.repeat(72));

  if (sim.skip) {
    console.log(`  ⏭️  ${sim.skip}`);
    return { id: sim.id, status: 'SKIP' as const, replies: [] as string[] };
  }

  const phone = `549110000${String(sim.id).padStart(4, '0')}@test.local`;
  await clearConversation(phone);

  const allReplies: string[] = [];

  for (let i = 0; i < sim.steps.length; i++) {
    const step = sim.steps[i];
    const stepNum = `[${i + 1}/${sim.steps.length}]`;

    const printReply = (r: string) => {
      const lines = r.split('\n');
      lines.forEach((ln, i) => {
        const prefix = i === 0 ? '        🤖 PAULA: ' : '        🤖        ';
        console.log(`${prefix}${ln}`);
      });
    };

    if (step.image) {
      console.log(`\n${stepNum} 📷 USER: <imagen>${step.note ? ` (${step.note})` : ''}`);
      const replies = await sendUserMsg(phone, '', FAKE_RECEIPT_URL);
      replies.forEach((r) => { printReply(r); allReplies.push(r); });
    } else if (step.txt) {
      console.log(`\n${stepNum} 👤 USER: ${step.txt}`);
      const replies = await sendUserMsg(phone, step.txt);
      replies.forEach((r) => { printReply(r); allReplies.push(r); });
    }
  }

  // Después de la sim: mostrar estado final de la reserva (si existe)
  try {
    const conv = db.getConversationByPhone(phone);
    if (conv) {
      const stateJson = db.getReservationState(conv.id);
      if (stateJson) {
        const state = JSON.parse(stateJson);
        if (state.event_id) {
          console.log('\n  📅 EVENTO CALENDAR creado:');
          console.log(`     event_id: ${state.event_id}`);
          console.log(`     calendar_id: ${state.calendar_id}`);
          console.log(`     cabaña: ${state.cabana} | ${state.check_in} → ${state.check_out} | ${state.personas}p`);
          console.log(`     total: $${state.total} | seña: $${state.sena}`);
          console.log(`     step actual: ${state.step}  ${state.step === 'completed' ? '✅ CONFIRMADO en Calendar' : '⏳ PENDIENTE'}`);
          console.log(`     URL Calendar: https://calendar.google.com/calendar/u/0/r/eventedit/${Buffer.from(`${state.event_id} ${state.calendar_id}`).toString('base64')}`);
        }
      }
    }
  } catch (e: any) {
    console.log(`  ⚠️  No se pudo leer estado de reserva: ${e.message}`);
  }

  console.log('\n  📋 Checks a verificar manualmente:');
  sim.checks.forEach((c) => console.log(`     • ${c}`));

  return { id: sim.id, status: 'DONE' as const, replies: allReplies };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🧪 TEST SIMULACIONES — IguazuFalls Paula');
  console.log(`   Tenant: ${process.env.TENANT_ID}`);
  console.log(`   DataDir: ${process.env.DATA_DIR}`);
  console.log(`   LLM: ${process.env.OPENAI_BASE_URL || 'OpenAI (default)'}`);
  console.log(`   Bypass: ${require('node:fs').existsSync(`${process.env.DATA_DIR}/bypass_receipt.flag`) ? 'ACTIVO ✅' : 'INACTIVO ❌ — activar desde dashboard'}`);

  const args = process.argv.slice(2).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  const sims = args.length > 0 ? SIMULACIONES.filter((s) => args.includes(s.id)) : SIMULACIONES;

  if (sims.length === 0) {
    console.log(`\n⚠️  No hay simulaciones para los IDs: ${args.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n   Ejecutando ${sims.length} simulación(es): ${sims.map((s) => s.id).join(', ')}\n`);

  const results: Array<{ id: number; status: 'DONE' | 'SKIP'; replies: string[] }> = [];

  for (const sim of sims) {
    const r = await runSim(sim);
    results.push(r);
  }

  console.log('\n\n' + '═'.repeat(72));
  console.log('REPORTE FINAL');
  console.log('═'.repeat(72));
  for (const r of results) {
    const icon = r.status === 'DONE' ? '✅' : '⏭️ ';
    console.log(`${icon} SIM ${r.id}: ${r.status} (${r.replies.length} respuestas)`);
  }
  console.log('\nRevisá las respuestas de Paula arriba contra los "Checks a verificar manualmente".');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
