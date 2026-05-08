 MegaBot — Contexto del proyecto

## Qué es
Dashboard multi-tenant de operador para gestionar conversaciones de WhatsApp de **3 empresas independientes** en un solo Next.js:
- **Mega Muebles & Sommiers** (Neuquén) — Bot: Sofía
- **IguazuFalls** — Bot: Paula
- **Impasto** — Bot: Chris

## Repositorio
- Repo: `C:\Users\spezi\Desktop\MegaBot`
- Branch de trabajo: `main` (implementación multi-tenant completa)
- Rama principal: `main`
- El código vive en el subdirectorio `agente-delivery/`

## Tech stack
- **Frontend/API**: Next.js 15 (App Router), React, Tailwind CSS v4, TypeScript
- **Bot/Worker**: Node.js con `tsx`, 3 procesos separados (uno por tenant)
- **WhatsApp**: Baileys (principal) o YCloud/Meta (alternativa)
- **AI**: OpenAI API (`getAIReply` en `src/lib/openai.ts`) — gpt-4o-mini, `max_tokens: 200`, `temperature: 0.4`
- **DB**: SQLite via `better-sqlite3` — una DB por tenant (`./data/{tenant}/messages.db`)
- **Catálogo/Empresa**: Supabase REST API (tablas `products` e `info_empresa`) para megamuebles y iguazufalls. **Insforge** para Impasto
- **Auth**: Supabase Auth + cookies httpOnly
- **PM2**: 4 procesos en producción (1 Next.js + 3 workers)

## Cómo correr

```bash
cd agente-delivery

# Desarrollo (Next.js :3000 + worker :3001 en paralelo)
npm run dev

# Solo Next.js
npm run next:dev

# Solo worker Baileys
npm run worker:dev

# Build
npm run build

# Producción (PM2)
pm2 start ecosystem.config.js
```

## Arquitectura multi-tenant

```
agente-delivery/
├── src/
│   ├── tenants.config.ts              # Config estático de 3 tenants (con dataSource)
│   ├── app/
│   │   ├── api/
│   │   │   ├── conversations/         GET lista, DELETE conversación
│   │   │   ├── messages/[id]/         GET mensajes, POST enviar, DELETE resetear
│   │   │   ├── mode/[id]/             POST cambiar modo AI/HUMAN
│   │   │   ├── status/                GET estado conexión WhatsApp
│   │   │   └── webhook/               POST recibe mensajes YCloud/Meta
│   │   ├── menu/
│   │   │   └── page.tsx               Landing pública de menú (Impasto), sin login
│   │   ├── login/
│   │   │   ├── page.tsx               Branding neutro
│   │   │   └── actions.ts             Login + cookie tenant-id httpOnly
│   │   ├── auth/callback/route.ts      OAuth callback
│   │   ├── layout.tsx                 Server Component → CSS vars del theme
│   │   └── page.tsx                   Server Component → Dashboard props
│   ├── components/
│   │   ├── Dashboard.tsx              Layout principal, polling
│   │   ├── ConversationList.tsx      Sidebar con avatares
│   │   ├── ConversationPanel.tsx      Chat, toggle, reset, delete
│   │   ├── MessageBubble.tsx           Burbujas user/bot/operador
│   │   ├── ModeToggle.tsx             AI ↔ HUMANO
│   │   └── StatusWidget.tsx           Estado conexión + QR
│   ├── lib/
│   │   ├── tenant.ts                   getSessionTenant() helper
│   │   ├── db.ts                       getDb(dataDir) factory + backward-compat
│   │   ├── system-prompt.ts            buildSystemPrompt + prompts por bot
│   │   ├── send-message.ts             workerUrl param requerido (sin fallback env)
│   │   ├── catalog.ts                  Fetch Supabase productos (megamuebles/iguazufalls)
│   │   ├── company-info.ts             Fetch Supabase info_empresa (megamuebles/iguazufalls)
│   │   ├── insforge-client.ts          ★ NEW — Fetch Insforge REST API (Impasto)
│   │   ├── delay.ts                    randomDelayMs + sleep
│   │   ├── openai.ts                   getAIReply (max_tokens: 200, temperature: 0.4)
│   │   ├── ycloud.ts                   SDK YCloud
│   │   └── supabase/                   client.ts + server.ts
│   ├── providers/
│   │   ├── types.ts                   WhatsAppProvider interface
│   │   ├── baileys.ts                  Implementación principal
│   │   ├── ycloud.ts                   Adapter YCloud
│   │   ├── meta.ts                     Stub Meta
│   │   └── factory.ts                  createProvider(env)
│   └── worker/
│       ├── index.ts                    HTTP :3001-3 (/status, /send)
│       └── handle-incoming.ts          Lógica AI/HUMAN + routing por dataSource
├── data/                               # 3 subdirectorios (uno por tenant)
│   ├── megamuebles/messages.db
│   ├── iguazufalls/messages.db
│   └── impasto/messages.db
└── ecosystem.config.js                 # PM2: 1 next + 3 workers
```

## Los 3 tenants

| ID | Email | Empresa | Bot | Worker | dataDir | Catálogo |
|---|---|---|---|---|---|---|
| megamuebles | megamuebles.lafalda@gmail.com | Mega Muebles & Sommiers | Sofía | :3001 | ./data/megamuebles | Supabase |
| iguazufalls | juanynatyzapata@hotmail.com | IguazuFalls | Paula | :3002 | ./data/iguazufalls | Supabase |
| impasto | spezialichristian@gmail.com | Impasto | Chris | :3003 | ./data/impasto | **Insforge** |

## Impasto — Insforge (catálogo separado)

Impasto usa **Insforge** en vez de Supabase para catálogo y empresa. Cada tenant tiene su propio `dataSource` en `tenants.config.ts`:

```ts
// tenants.config.ts
{ id: 'impasto', dataSource: 'insforge', ... }
{ id: 'megamuebles', dataSource: 'supabase', ... }  // default
```

**Archivos clave:**
- `src/lib/insforge-client.ts` — cliente REST para Insforge (fetch menú + empresa)
- `src/worker/handle-incoming.ts` — routing: si `dataSource === 'insforge'` usa Insforge, si no usa Supabase

**Detalles Insforge:**
- Project ID: `71b736cc-e500-4c93-93be-ac3d89b0fd43`
- URL: `https://3agqcygs.us-east.insforge.app`
- Tablas: `productos` (57 items), `info_empresa_impasto` (7 rows), `pedidos` (pendiente), `clientes` (pendiente)
- REST API: `fetch('https://3agqcygs.us-east.insforge.app/api/database/records/{table}', { headers: { apikey: '...' } })`
- **Formato de respuesta**: devuelve array directo `[{...}]`, NO `{ value: [...] }`
- **El `@insforge/sdk` NO funciona con tsx/Node.js** — usar fetch REST directo
- Categorías: Pizzas (32, $15k-$25k), Empanadas (9, $3.2k-$3.5k), Calzones (4), Hamburguesas (8), Lomos (3), Esfiha (1)

### Landing pública de menú

Ruta pública `/menu` que muestra el catálogo de Impasto a clientes sin login:
- **URL**: `https://megabot-admin.cloud/menu` (o `http://localhost:3000/menu` local)
- **Middleware**: bypass de auth en `src/middleware.ts` — `/menu` es ruta pública
- **Página**: `src/app/menu/page.tsx` — Server Component, fetch SSR desde Insforge
- **Diseño**: "Osteria Editoriale" — hero audaz con tipografía editorial (DM Serif Display + DM Sans), grilla 2-3 columnas con filas minimalistas (nombre | precio), textura de ruido sutil, animaciones staggered
- **Datos**: usa `fetchMenuItems()` exportado de `src/lib/insforge-client.ts`
- **Env vars necesarias en `.env.local`**: `INSFORGE_URL` e `INSFORGE_ANON_KEY` (para que Next.js SSR tenga acceso)
- **Prompt de Chris**: actualizado para dirigir clientes al menú online cuando pregunten por variedades/precios

### Insforge keep-alive (anti-pausa)

El tier gratuito de Insforge pausa proyectos inactivos (~diario). El worker de Impasto incluye un keep-alive en `src/worker/index.ts`:
- Solo se activa si `TENANT.dataSource === 'insforge'`
- Primer ping a los 30s de arrancar
- Ping cada ~24h con ±30 min de jitter aleatorio (para no ser predecible)
- Llama a `fetchMenuItems()` para generar tráfico DB (el proyecto no se pausa)
- Silencioso si falla — solo loguea éxito

## Paletas de theme (CSS vars en layout.tsx)

- **megamuebles**: primary #22d986, accent #0fa860, bg #060a0f
- **iguazufalls**: primary #c084fc, accent #ec4899, bg #08040f
- **impasto**: primary #60a5fa, accent #2563eb, bg #030a12

## Flujo de autenticación multi-tenant

1. Usuario entra a `/login` → Supabase Auth (email/password)
2. `login/actions.ts` verifica email contra `tenants.config.ts`
3. Si es tenant válido → set cookie `tenant-id` httpOnly
4. `middleware.ts` valida cookie en cada request privado
5. `layout.tsx` inyecta CSS vars según tenant de la sesión

## Flujo de mensaje entrante (Baileys/YCloud)

1. Provider recibe mensaje → llama `handleIncoming(msg, provider)`
2. `handle-incoming.ts` usa TENANT_ID del env para:
   - Cargar DB correcta (`getDb(process.env.DATA_DIR)`)
   - Buscar config del tenant en `tenants.config.ts`
3. **Routing por dataSource**:
   - Si `dataSource === 'insforge'` → `insforge-client.ts` (solo Impasto)
   - Si `dataSource === 'supabase'` o undefined → `catalog.ts` + `company-info.ts` (Supabase)
4. Si modo AI → construye system prompt → OpenAI (`max_tokens: 200`, `temperature: 0.4`) → delay → envía
5. Dashboard (polling 10s) muestra el mensaje

## Variables de entorno

### `.env.local` — Solo vars compartidas (Next.js + todos los workers)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
WHATSAPP_PROVIDER=baileys
# Insforge — necesario para SSR de /menu (Next.js)
INSFORGE_URL=https://3agqcygs.us-east.insforge.app
INSFORGE_ANON_KEY=eyJ...
```

### `.env.{tenant}` — Vars por tenant (generadas por `setup-vps.sh`)
Cada worker carga su propio archivo via `--env-file=.env.{tenant}` en `ecosystem.config.js`.
**NUNCA poner TENANT_ID/WORKER_PORT/DATA_DIR en `.env.local`** — contamina los otros workers.

```
TENANT_ID=megamuebles
WORKER_PORT=3001
DATA_DIR=./data/megamuebles
SUPABASE_PRODUCTS_TABLE=products
SUPABASE_COMPANY_INFO_TABLE=info_empresa
# + todas las vars compartidas repetidas para que el worker sea autónomo
```

### `.env.impasto` — Insforge + vars compartidas
```
TENANT_ID=impasto
WORKER_PORT=3003
DATA_DIR=./data/impasto
AI_REPLY_DELAY=true
# Supabase (no usado pero necesario para auth)
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
# Insforge (catálogo)
INSFORGE_URL=https://3agqcygs.us-east.insforge.app
INSFORGE_ANON_KEY=eyJ...
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Los 3 archivos (`.env.megamuebles`, `.env.iguazufalls`, `.env.impasto`) están gitignored.
Templates disponibles en `.env.megamuebles.example` etc.

### Vars exclusivas de IguazuFalls (`.env.iguazufalls`)
Además de las vars compartidas:
- `GOOGLE_SERVICE_ACCOUNT_JSON` — JSON del Service Account con permiso sobre los 11 calendarios de Google Calendar (en una sola línea, sin saltos)
- `GOOGLE_CALENDAR_TIMEZONE=America/Argentina/Buenos_Aires`
- `BANK_ALIAS`, `BANK_CBU`, `BANK_TITULAR` — datos para validación de comprobantes de transferencia (deben coincidir con los datos en `info_empresa_iguazufalls`)

## Deployment producción

### Deploy normal (solo código)
```bash
ssh root@2.24.72.12
cd MegaBot/agente-delivery
git pull
npm run build
pm2 restart all   # basta si NO cambiaron .env files ni ecosystem.config.js
```

### Deploy con cambios de env o ecosystem.config.js
```bash
# pm2 restart NO recarga env — hay que matar el daemon:
pm2 kill && pm2 start ecosystem.config.js
pm2 save
```

### Bootstrap completo (primera vez o reset total)
```bash
bash scripts/setup-vps.sh
# Genera los 3 .env.{tenant}, npm install, build, pm2 kill+start+save
```

### Rotar OpenAI key en VPS
```bash
NEW_KEY=sk-proj-...
sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$NEW_KEY|" .env.local .env.megamuebles .env.iguazufalls .env.impasto
pm2 kill && pm2 start ecosystem.config.js
```

### Verificar tenants arrancados
```bash
pm2 logs --lines 20 --nostream | grep -E "boot|FATAL"
# Cada worker imprime: [worker] boot | tenant=X | port=N | dataDir=...
```

### Multi-browser — dashboard isolation
Supabase Auth usa una cookie por dominio por browser. Para ver 2 dashboards simultáneos del mismo servidor, usar **2 perfiles de Chrome distintos** (o Chrome + Firefox). El mismo perfil siempre mostrará los datos del último tenant logueado.

### Setup inicial IguazuFalls (una vez)
1. **Supabase** — las tablas `products_iguazufalls` (schema cabañas: nombre, tipo, capacidad_min/max, precio_baja/media/alta, calendar_id, activo) y `info_empresa_iguazufalls` (key/value: categoria, informacion) ya existen y están pobladas con las 11 cabañas + 17 entradas de info. El seed script `agente-delivery/scripts/seed-iguazufalls.ts` permite re-poblar si hace falta:
   ```bash
   cd agente-delivery
   npx tsx --env-file=.env.iguazufalls scripts/seed-iguazufalls.ts
   ```

2. **Google Calendar Service Account** (manual, una vez):
   - Console: https://console.cloud.google.com → crear proyecto `iguazufalls-bot`
   - APIs & Services → Library → habilitar **Google Calendar API**
   - Credentials → Create Service Account → Keys → Add Key → JSON → descargar
   - Copiar el `client_email` del JSON
   - En cada uno de los 11 calendarios de Google, agregar ese email como invitado con permiso "Hacer cambios y administrar el uso compartido"
   - Pegar el JSON completo en una sola línea como `GOOGLE_SERVICE_ACCOUNT_JSON=...` en `.env.iguazufalls`

3. **Datos bancarios** — completar `BANK_TITULAR`, `BANK_CBU`, `BANK_ALIAS` en `.env.iguazufalls` y actualizar las filas `banco_titular`, `banco_cbu`, `banco_alias`, `banco_nombre` en `info_empresa_iguazufalls` (Supabase) con los datos reales del operador.

4. **Comando admin de prueba** — desde el WhatsApp del operador hacia sí mismo:
   ```
   #reservar 5491100000000 "Lodge Timbó" 2030-01-15 2030-01-18 2 144000 72000 "Test Bot"
   ```
   Crea un evento PENDIENTE en el calendario y deja la conversación en estado `awaiting_receipt`. Verificar en Google Calendar y luego borrar manualmente.

## Issues conocidos (pendientes de fix)
- **CRÍTICO**: `webhook/route.ts` bloquea HTTP 15-25s → YCloud puede reintentar (duplicados). Fix: fire-and-forget async.
- **IMPORTANTE**: `catalog.ts` + `company-info.ts` sin AbortSignal/timeout en fetch Supabase.
- **Insforge**: `@insforge/sdk` no funciona con tsx/Node.js por ESM export issues — usar fetch REST directo.

## Features del dashboard
- Theming por tenant (colores, branding)
- Lista de conversaciones con avatares de iniciales
- Toggle AI ↔ HUMANO por conversación
- Envío manual de mensajes (modo HUMAN)
- Resetear memoria IA (borra historial)
- Borrar conversación completa
- StatusWidget (estado conexión + QR Baileys)
- Polling automático cada 10s

## Bot Chris (Impasto) — System prompt profesional

Prompt reescrito para sistema de pedidos profesional. Reglas clave:
- **Sinónimos**: burger→Hamburguesa, lomito→Lomos, muzza→Muzzarela, four cheese→Pizza 4 Quesos, sandwich de milanesa→Pizza o empanada (NO sanguche)
- **Precio por unidad**: empanadas se venden por unidad, docenas se arman con sabores que elija el cliente
- **Solo pizza individual**: no mitad y mitad, solo sabor único por pizza (estilo napolitano)
- **Sin opciones especiales**: no celiacos, no veganos, no sin gluten, no delivery por app
- **Delivery $5.000**, retiro sin costo, sin preguntar método de pago si es retiro
- **Resumen final SOLO al confirmar**: no mostrar resumen intermedio, solo monto total
- **Verificar comprobantes**: monto correcto + cuenta correcta (Alias IMPASTO.PIZZA, CBU 0110594930059498273498, Christian Speziali)
- **No inventar**: si no hay algo, decir "no tenemos eso" y ofrecer alternativa, NUNCA inventar productos
- **Máx 3 líneas** por respuesta, argentino voseo, sin ¿ de apertura, no terminar con preguntas (excepto "agregás algo más?")