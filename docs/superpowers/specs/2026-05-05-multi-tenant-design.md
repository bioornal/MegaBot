# Multi-Tenant Bot Dashboard — Diseño

**Fecha:** 2026-05-05  
**Proyecto:** MegaBot (agente-delivery)  
**Objetivo:** Adaptar el dashboard de WhatsApp para soportar múltiples tenants (bots/empresas) en un único VPS, con theming por tenant y aislamiento completo de datos.

---

## Tenants

| ID | Email | Empresa | Bot | Worker port | Data dir |
|---|---|---|---|---|---|
| `megamuebles` | megamuebles.lafalda@gmail.com | Mega Muebles & Sommiers | Sofía | 3001 | `./data/megamuebles` |
| `iguazufalls` | juanynatyzapata@hotmail.com | IguazuFalls | Paula | 3002 | `./data/iguazufalls` |
| `impasto` | spezialichristian@gmail.com | Impasto | Chris | 3003 | `./data/impasto` |

---

## Arquitectura

### Enfoque
Una sola app Next.js (puerto 3000) sirve los tres dashboards. El tenant se resuelve a partir del email de Supabase Auth y se propaga como `tenantId` en una cookie de sesión. Cada tenant tiene su propio worker Node.js y su propio directorio de datos — aislamiento completo sin deployments separados.

### Procesos en el VPS (PM2)
```
next              → puerto 3000  (una sola instancia)
worker-megamuebles → puerto 3001  (DATA_DIR=./data/megamuebles, TENANT_ID=megamuebles)
worker-iguazufalls → puerto 3002  (DATA_DIR=./data/iguazufalls, TENANT_ID=iguazufalls)
worker-impasto     → puerto 3003  (DATA_DIR=./data/impasto, TENANT_ID=impasto)
```

### Estructura de directorios
```
agente-delivery/
├── src/
│   ├── tenants.config.ts       ← fuente de verdad única (nuevo)
│   ├── lib/tenant.ts           ← helpers getTenantByEmail, getTenantById (nuevo)
│   └── ...
├── data/
│   ├── megamuebles/
│   │   ├── messages.db
│   │   └── baileys-session/
│   ├── iguazufalls/
│   │   ├── messages.db
│   │   └── baileys-session/
│   └── impasto/
│       ├── messages.db
│       └── baileys-session/
└── ecosystem.config.js         ← configuración PM2 multi-proceso (nuevo)
```

---

## Componentes nuevos

### `src/tenants.config.ts`
Array de configuración estático con todos los tenants. Cada entry contiene:
- `id`: slug único del tenant
- `email`: email exacto de Supabase Auth que mapea a este tenant
- `name`: nombre de la empresa (mostrado en el dashboard)
- `botName`: nombre del bot visto por los clientes en WhatsApp
- `workerUrl`: URL interna del worker (`http://localhost:300X`)
- `dataDir`: ruta al directorio de datos SQLite + sesión Baileys
- `theme`: objeto con `primary`, `accent`, `bg`, `surface`, `border`, `textMuted` (colores CSS)

### `src/lib/tenant.ts`
Helpers puros:
- `getTenantByEmail(email: string): Tenant | null` — lookup por email
- `getTenantById(id: string): Tenant | null` — lookup por id
- `getRequiredTenant(email: string): Tenant` — lanza error si no encuentra (para rutas protegidas)

### `ecosystem.config.js`
Configuración PM2 con 4 apps: `next` (start Next.js) + un `worker-<id>` por tenant, cada uno con su `env` específico (`WORKER_PORT`, `DATA_DIR`, `TENANT_ID`).

---

## Archivos modificados

### `src/app/layout.tsx`
Server Component. Lee la sesión de Supabase, resuelve el tenant con `getTenantByEmail`, e inyecta las CSS variables del tema en el atributo `style` del elemento `<html>`:
```tsx
// Fallback neutro (slate) cuando no hay sesión — login page
<html style={{
  '--color-primary': tenant?.theme.primary ?? '#64748b',
  '--color-accent':  tenant?.theme.accent  ?? '#475569',
  '--color-bg':      tenant?.theme.bg      ?? '#060a0f',
  '--color-surface': tenant?.theme.surface ?? '#0d1219',
  '--color-border':  tenant?.theme.border  ?? '#1c2836',
  '--color-muted':   tenant?.theme.textMuted ?? '#3d5268',
} as React.CSSProperties}>
```
El fallback en slate asegura que la login page sea visualmente neutra (sin verde ni violeta ni azul).

### `src/app/login/page.tsx`
El logo y el nombre de la app se neutralizan: icono de WhatsApp en gris slate, nombre "Bot Dashboard", subtítulo "Iniciá sesión para continuar". No hay referencia a ningún tenant específico. Los colores del formulario usan variables CSS (ya tienen fallback neutro si no hay sesión).

### `src/app/login/actions.ts`
Después de `signInWithPassword` exitoso:
1. Obtiene el email del usuario autenticado.
2. Llama `getTenantByEmail(email)`.
3. Si no encuentra tenant → devuelve error "Tu cuenta no tiene acceso a este sistema".
4. Guarda `tenantId` en una cookie httpOnly de sesión (`tenant-id`).
5. Redirige a `/`.

### `src/middleware.ts`
Además del chequeo de sesión existente, verifica que la cookie `tenant-id` exista y corresponda a un tenant válido (lookup en `TENANTS`). Si no, redirige a `/login`.

### `src/lib/db.ts`
La instancia de SQLite deja de ser un singleton global. Se exporta `openDb(dataDir: string): Database` que abre (o crea) la DB en el directorio indicado. Los stmts pasan a ser creados por llamada o cacheados por `dataDir`. Cada API route resuelve el `dataDir` del tenant antes de llamar a `openDb`.

### `src/lib/send-message.ts`
Recibe `workerUrl` como parámetro en lugar de leer `WORKER_INTERNAL_URL` del env. Las API routes le pasan `tenant.workerUrl`.

### `src/app/api/status/route.ts`
Lee el tenant de la sesión y hace fetch a `tenant.workerUrl/status` en lugar de `WORKER_INTERNAL_URL`.

### `src/app/api/conversations/route.ts` y `[conversationId]/route.ts`
Resuelven el tenant de la sesión y pasan `tenant.dataDir` a `openDb`.

### `src/app/api/messages/[conversationId]/route.ts`
Ídem — `openDb(tenant.dataDir)`.

### `src/app/api/mode/[conversationId]/route.ts`
Ídem.

### Componentes (`Dashboard.tsx`, `ConversationList.tsx`, `ConversationPanel.tsx`, `StatusWidget.tsx`, `ModeToggle.tsx`, `MessageBubble.tsx`)
Todos los colores hardcodeados que hoy son `#22d986`, `#0fa860`, `#0d3d26`, `#060a0f`, `#0d1219`, `#1c2836`, `#3d5268`, `#7a9bb5`, `#e8f0f8` se reemplazan por `var(--color-primary)`, `var(--color-accent)`, `var(--color-bg)`, `var(--color-surface)`, `var(--color-border)`, `var(--color-muted)` respectivamente.

El header del `Dashboard.tsx` muestra `tenant.name` y `tenant.botName`. Como `Dashboard` es un Client Component, los recibe vía props desde `src/app/page.tsx`, que se convierte en Server Component: llama a `getServerSession()`, resuelve el tenant y renderiza `<Dashboard tenantName={tenant.name} botName={tenant.botName} tenantId={tenant.id} />`.

### `src/worker/handle-incoming.ts`
Lee `TENANT_ID` del env para saber qué entrada del config usar (system prompt, botName). El `botName` del tenant reemplaza la referencia hardcodeada a "Sofía" en el system prompt builder.

### `src/lib/system-prompt.ts`
Acepta `botName` y `companyName` como parámetros en lugar de tenerlos hardcodeados.

---

## Paletas de color

### megamuebles (verde — existente)
```ts
{ primary: '#22d986', accent: '#0fa860', bg: '#060a0f', surface: '#0d1219', border: '#1c2836', textMuted: '#3d5268' }
```

### iguazufalls (violeta/rosa)
```ts
{ primary: '#c084fc', accent: '#ec4899', bg: '#08040f', surface: '#110820', border: '#2d1a47', textMuted: '#5a3a7a' }
```

### impasto (azul)
```ts
{ primary: '#60a5fa', accent: '#2563eb', bg: '#030a12', surface: '#071220', border: '#0f2a47', textMuted: '#1a3a5a' }
```

---

## Flujo de login completo

1. Usuario entra a `/` → middleware detecta que no hay sesión → redirige a `/login`.
2. Login page muestra formulario neutro (sin branding de tenant).
3. Usuario ingresa email + contraseña → `actions.ts` llama a Supabase Auth.
4. Auth exitoso → `getTenantByEmail(email)` resuelve el tenant.
5. Se guarda `tenant-id` en cookie httpOnly.
6. Redirect a `/`.
7. `layout.tsx` lee la sesión, resuelve el tenant, inyecta CSS variables.
8. Dashboard se renderiza con el tema del tenant: colores, nombre de empresa, nombre del bot.

---

## Flujo de un mensaje entrante (multi-tenant)

1. Worker arranca con `TENANT_ID` y `DATA_DIR` del env.
2. Baileys recibe mensaje → `handleIncoming(msg, provider)`.
3. `handle-incoming.ts` lee `TENANT_ID` → obtiene config (botName, system prompt base) de `tenants.config.ts`.
4. Abre SQLite en `DATA_DIR/messages.db`.
5. Guarda mensaje, llama OpenAI con el system prompt del tenant, envía respuesta.
6. Dashboard del operador (polling /api/conversations con `tenant.dataDir`) muestra el mensaje.

---

## Variables de entorno por worker

Los workers no necesitan nuevas env vars de Supabase ni de Next.js. Solo necesitan:
```
TENANT_ID=megamuebles   # o iguazufalls o impasto
WORKER_PORT=3001        # 3002 o 3003
DATA_DIR=./data/megamuebles
OPENAI_API_KEY=...
# Supabase opcional (catálogo/empresa)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Consideraciones de seguridad

- La cookie `tenant-id` es httpOnly y se valida en middleware en cada request. Un usuario no puede cambiar su tenant manipulando la cookie porque el middleware hace lookup en `TENANTS` y revalida contra el email de la sesión Supabase.
- Las API routes no confían en el `tenantId` de la cookie sola — siempre re-validan desde la sesión Supabase para obtener el email y resolver el tenant fresco.
- Un tenant no puede acceder a datos de otro: el `dataDir` se deriva del tenant resuelto de la sesión, nunca de un parámetro de la request.

---

## Archivos que NO cambian

- `src/providers/baileys.ts` y el resto de providers
- `src/worker/index.ts` (el worker entry point ya lee `WORKER_PORT` y `DATA_DIR` del env)
- `src/lib/catalog.ts` y `src/lib/company-info.ts` (siguen usando env vars Supabase por worker)
- `src/lib/openai.ts`
- `src/lib/delay.ts`
- `src/lib/ycloud.ts`
- `src/types.ts`

---

## Agregar un nuevo tenant en el futuro

1. Crear usuario en Supabase Auth con el email del nuevo tenant.
2. Agregar una entrada al array `TENANTS` en `tenants.config.ts`.
3. Agregar una app al `ecosystem.config.js` con su puerto y dataDir.
4. `pm2 reload ecosystem.config.js` en el VPS.
