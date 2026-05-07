# Bot Paula — IguazuFalls Duplex & Lodge

**Fecha:** 2026-05-07  
**Tenant:** `iguazufalls` — worker :3002  
**Bot:** Paula  
**Sitio web del complejo:** https://www.iguazufallslodge.com

---

## Contexto

IguazuFalls Duplex & Lodge es un complejo de 11 alojamientos en Puerto Iguazú, Misiones, Argentina. Cuenta con piscina central habilitada todo el año y parrilla compartida. El bot Paula atiende consultas por WhatsApp y gestiona reservas de forma autónoma hasta la verificación del comprobante de seña.

El tenant `iguazufalls` ya existe en MegaBot con su worker, base de datos SQLite y tablas Supabase (`products_iguazufalls`, `info_empresa_iguazufalls`). Los 11 calendarios de Google ya están creados en la cuenta de pruebas (spezialichristian@gmail.com); en producción se cambiarán a los IDs de la cuenta del operador final.

---

## Arquitectura

```
Supabase (products_iguazufalls)     Google Calendar (11 calendarios)
   datos estáticos de cabañas    +    reservas dinámicas
           ↓                                  ↓
     Worker Paula (:3002)
     handle-incoming.ts
           ↓
     GPT-4o-mini (OpenAI)
```

### Supabase — fuente de datos estáticos

Tabla `products_iguazufalls` — 11 filas, una por cabaña:

| Columna | Tipo | Descripción |
|---------|------|-------------|
| nombre | TEXT | Nombre oficial (ej. "Lodge Ambay") |
| tipo | TEXT | Studio / Lodge / Duplex |
| descripcion | TEXT | Descripción corta |
| capacidad_min | INT | Mínimo de personas |
| capacidad_max | INT | Máximo de personas |
| metros2 | INT | Superficie |
| amenidades | TEXT | Lista separada por coma |
| precio_baja | INT | Precio/noche temporada baja |
| precio_media | INT | Precio/noche temporada media |
| precio_alta | INT | Precio/noche temporada alta |
| calendar_id | TEXT | ID completo del calendario Google |
| activo | BOOL | Si está disponible para reservas |

Tabla `info_empresa_iguazufalls` — datos del complejo y cuenta bancaria:

- Nombre, dirección, teléfono, sitio web
- Check-in: 14:00 hs · Check-out: 10:00 hs *(placeholder — actualizar)*
- Estadía mínima: 2 noches *(placeholder — actualizar)*
- CBU, alias y titular de cuenta bancaria *(placeholder — actualizar con datos reales)*
- Datos para MercadoPago *(fase 2)*

### Google Calendar — fuente de disponibilidad

11 calendarios, uno por cabaña. Cada evento de reserva contiene:

```
Título:    ⏳ PENDIENTE — [Nombre huésped] ([N] personas)
Descripción:
  Teléfono: +54...
  Cabaña: Lodge Ambay
  Check-in: 2026-07-15 14:00
  Check-out: 2026-07-18 10:00
  Noches: 3
  Total: $155.000
  Seña (50%): $77.500
  Estado seña: PENDIENTE
```

El operador actualiza el título a `✅ CONFIRMADA` manualmente desde la app de Google Calendar en el celular, una vez verificada la transferencia.

### IDs de calendarios (cuenta de pruebas)

| Cabaña | Calendar ID |
|--------|-------------|
| Studio Lapacho | `b3e858337063872815929235fddfa2ad9ad1f22fc4c57ab6b09a351218454086@group.calendar.google.com` |
| Studio Guembe | `936df3b9fee5d46b62bb2509f62d833b08d514eff4572b99f3fd76f47d7a57f7@group.calendar.google.com` |
| Lodge Ambay | `79f3cd533880add5fe08018c9d725cd31538dac7aea81b6cf99a1948e22ca75d@group.calendar.google.com` |
| Lodge Palo Rosa | `b178b1ea4c8db01190779f39b39fca73babd744cbd9225734a64459c21237246@group.calendar.google.com` |
| Lodge Araucaria | `c8d3cf841b853bdbffa743e6f5125eb5d2d466ff9cd5eb74fe7fd143759302d5@group.calendar.google.com` |
| Lodge Guatambú | `b51e195f11b8b36880b743b944a32761e12958915eea510c917f543a19c1c66b@group.calendar.google.com` |
| Lodge Timbó | `4bae476b313c5383445a898ec07a834c0919abb053d513f20f1e90832af21617@group.calendar.google.com` |
| Duplex Laurel | `eff75168b5d05a8cd9ef114db558eea22906353a6dbba4a814be37172df7a2a7@group.calendar.google.com` |
| Duplex Cedro | `5cc1e9e5b1b3e40a92b956e52a2b8be839423a9b6c64b6d177924553393098bf@group.calendar.google.com` |
| Duplex Ombú | `c5c7557494415560a36c34f26dfb18afcf17ee8e6a6271482d1c5d1c6f93d2b6@group.calendar.google.com` |
| Duplex Pitanga | `e185dda5604b4b30c0a86428f5d3ef42123ce26de8cd45d7f177da04bb55dfd7@group.calendar.google.com` |

> **Producción:** reemplazar por los IDs de la cuenta del operador final en `.env.iguazufalls`.

---

## Catálogo de cabañas

### Studios (monoambiente, 25 m²)

| Cabaña | Cap. | Amenidades |
|--------|------|------------|
| Studio Lapacho | 1–4 | AC, WiFi, cocina completa, Queen + sofá cama, TV cable, garage (consultar) |
| Studio Guembe | 1–4 | AC, WiFi, microondas, frigobar, King + 2 individuales, TV cable, garage (consultar) |

### Lodges

| Cabaña | Cap. | m² | Descripción | Amenidades |
|--------|------|----|-------------|------------|
| Lodge Ambay | 2–4 | 30 | 2 habitaciones | AC, WiFi, balcón, cocina, Queen + cucheta, TV cable, garage |
| Lodge Palo Rosa | 2–4 | 30 | 2 habitaciones | Igual a Ambay |
| Lodge Araucaria | 1–4 | 25 | 1 habitación | AC, WiFi, cocina, King + sofá cama, TV cable, garage |
| Lodge Guatambú | 1–4 | 25 | 1 habitación | Igual a Araucaria |
| Lodge Timbó | 1–2 | 20 | 1 habitación | AC, WiFi, cocina, King, TV cable, garage |

### Duplex (2 plantas, 50 m²)

| Cabaña | Cap. | Amenidades |
|--------|------|------------|
| Duplex Laurel | 2–6 | AC, WiFi, balcón, cocina, Queen (planta alta) + cucheta/2 individuales (baja), TV cable, garage |
| Duplex Cedro | 2–6 | Igual a Laurel |
| Duplex Ombú | 2–6 | Igual a Laurel |
| Duplex Pitanga | 2–6 | Igual a Laurel |

**Complejo:** piscina central habilitada todo el año + área de descanso + parrilla.

---

## Sistema de temporadas y precios

```
Temporada Alta:  15 jun – 15 ago | 23 dic – 20 feb | 18 – 21 abr
Temporada Media: 21 feb – 31 mar
Temporada Baja:  Resto del año
```

La temporada se determina por la **fecha de check-in**. El módulo `src/lib/season.ts` recibe una fecha y devuelve `'alta' | 'media' | 'baja'`.

### Precios de referencia (placeholder — actualizar)

| Tipo | Baja | Media | Alta |
|------|------|-------|------|
| Studio | $35.000 | $42.000 | $55.000 |
| Lodge Timbó | $32.000 | $38.000 | $48.000 |
| Lodge 1 hab. | $40.000 | $48.000 | $62.000 |
| Lodge 2 hab. | $45.000 | $54.000 | $70.000 |
| Duplex | $60.000 | $72.000 | $90.000 |

### Extras opcionales

| Extra | Precio |
|-------|--------|
| Toallas y sábanas | $3.000 / persona |
| Garage | $10.000 / noche |
| Limpieza | $20.000 (siempre, obligatorio) |

### Cálculo total

```
Total = (precio/noche × noches) + limpieza + (toallas × personas) + (garage × noches)
Seña  = Total × 50%
```

---

## Flujo de conversación

### Estados

1. **SALUDO** — una sola vez, nunca repetir
2. **CONSULTA** — info general → redirigir a sitio web para detalles/fotos/amenidades
3. **DATOS** — recolectar: fechas, personas, cabaña preferida, nombre y teléfono del huésped
4. **DISPONIBILIDAD** — filtrar por capacidad en Supabase → consultar Google Calendar de candidatas
5. **EXTRAS_Y_CALCULO** — ofrecer extras → calcular total con desglose
6. **CONFIRMACION** — cliente confirma → crear evento PENDIENTE en Google Calendar
7. **SEÑA** — informar monto 50% + datos bancarios desde `info_empresa_iguazufalls`
8. **VERIFICACION** — cliente envía comprobante (imagen) → bot analiza con GPT-4o-mini vision
9. **OPERADOR** — operador confirma manualmente en Google Calendar → CONFIRMADA

### Regla de disponibilidad

- **No consultar Calendar sin cabaña elegida primero.**
- Si el cliente pide disponibilidad sin elegir: mostrar lista filtrada por capacidad, luego consultar Calendar de las candidatas.
- Detectar intención de disponibilidad/reserva por keywords en el mensaje antes de llamar al LLM.

### Verificación de comprobante

El bot recibe la imagen (ya soportado vía `media_url` en el código actual) y evalúa:
1. ¿El monto coincide con el 50% calculado?
2. ¿La cuenta de destino (CBU/alias) es la correcta?

Respuestas posibles:
- ✅ Monto y cuenta correctos → "Comprobante recibido. El equipo confirmará tu reserva en breve."
- ❌ Cuenta incorrecta → "La cuenta de destino no corresponde. Revisá los datos que te pasamos."
- ❌ Monto incorrecto → "El monto no coincide con la seña requerida de $[X]."
- ⚠️ No se puede verificar → "No pude verificar el comprobante. El equipo se contactará pronto."

El operador siempre confirma manualmente — el bot no confirma la reserva automáticamente.

### Grupos > 6 personas (v2)

Proponer combinación de cabañas. Tratar cada cabaña como reserva independiente y secuencial. Reservado para fase 2.

---

## Módulos nuevos

### `src/lib/season.ts`

```typescript
export type Season = 'alta' | 'media' | 'baja'
export function getSeason(checkIn: Date): Season
```

### `src/lib/calendar-gcal.ts`

```typescript
// Requiere GOOGLE_SERVICE_ACCOUNT_JSON en env
export async function checkAvailability(
  calendarId: string,
  checkIn: Date,
  checkOut: Date
): Promise<boolean>

export async function createReservationEvent(
  calendarId: string,
  summary: string,
  description: string,
  checkIn: Date,
  checkOut: Date
): Promise<string> // returns eventId
```

### `src/lib/verify-payment.ts`

```typescript
export async function verifyPaymentReceipt(
  imageUrl: string,
  expectedAmount: number,
  accountAlias: string,
  accountCBU: string
): Promise<{ ok: boolean; issue?: string }>
```

---

## Estado de reserva en SQLite

La verificación del comprobante necesita saber el monto esperado (50% del total) entre mensajes. La tabla `conversations` actual no tiene estado persistente. Se añade:

```sql
ALTER TABLE conversations ADD COLUMN reservation_state TEXT; -- JSON
```

Estructura del JSON:

```json
{
  "step": "awaiting_payment" | "awaiting_receipt" | "completed",
  "cabana": "Lodge Ambay",
  "calendar_id": "79f3cd...@group.calendar.google.com",
  "check_in": "2026-07-15",
  "check_out": "2026-07-18",
  "personas": 3,
  "total": 155000,
  "sena": 77500,
  "huesped_nombre": "Juan Pérez",
  "huesped_telefono": "+5493757123456",
  "event_id": "abc123" 
}
```

Métodos nuevos en `DbContext`:
- `getReservationState(conversationId): ReservationState | null`
- `setReservationState(conversationId, state: ReservationState | null): void`

El campo `ALTER TABLE` usa el mismo patrón try/catch que ya existe en `db.ts` para `media_url`.

---

## Modificaciones a archivos existentes

### `src/lib/system-prompt.ts`

Reescribir `SYSTEM_PROMPT_PAULA` completamente:
- Contexto: complejo de cabañas (no agencia de excursiones)
- Reglas de saludo, disponibilidad, cálculo, comprobante
- Redirigir a `iguazufallslodge.com` para detalles/fotos
- No inventar precios ni disponibilidad

### `src/worker/handle-incoming.ts`

Agregar antes de llamar al LLM:
1. Detección de intención: ¿el mensaje contiene fechas/personas/disponibilidad/comprobante?
2. Si hay intención de disponibilidad: llamar `checkAvailability()` e inyectar resultado como bloque `DISPONIBILIDAD` en el system prompt
3. Si el mensaje tiene `media_url` y el estado conversacional indica que se esperaba comprobante: llamar `verifyPaymentReceipt()` e inyectar resultado

### `src/lib/catalog.ts`

Adaptar `getCatalogContext()` para el nuevo schema de 3 precios. El catálogo se usa internamente para que el bot conozca capacidades y precios — no para exponer amenidades al usuario en el chat.

---

## Variables de entorno nuevas (`.env.iguazufalls`)

```env
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_CALENDAR_TIMEZONE=America/Argentina/Buenos_Aires
```

> Alternativa: usar OAuth refresh token si no se quiere crear un Service Account.

---

## Decisiones de diseño

| Decisión | Razón |
|----------|-------|
| Google Calendar como fuente de reservas | Ya están los 11 calendarios creados; el operador lo usa desde el móvil sin aprender nada nuevo |
| Supabase para datos de cabañas | Encaja con el stack existente; getCatalogContext() ya funciona |
| Bot no confirma reserva automáticamente | El operador valida la seña antes de confirmar — más seguro |
| Redirigir al sitio para detalles | Evita que el bot dé info desactualizada; el sitio es la fuente de verdad visual |
| GPT-4o-mini para verificar comprobante | Ya es el modelo configurado; soporta visión sin costo adicional |
| MercadoPago en fase 2 | Requiere integración extra; transferencia cubre el 90% de los casos |
| Grupos >6 personas en fase 2 | Agrega complejidad; menos frecuente |

---

## Fuera de scope (v1)

- Envío de email de confirmación al huésped
- MercadoPago / tarjeta de crédito
- Grupos > 6 personas (multi-cabaña)
- Soporte multilenguaje (inglés / portugués)
- Sincronización inversa Calendar → Supabase
