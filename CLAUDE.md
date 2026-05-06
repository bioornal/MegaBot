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
- **AI**: OpenAI API (`getAIReply` en `src/lib/openai.ts`)
- **DB**: SQLite via `better-sqlite3` — una DB por tenant (`./data/{tenant}/messages.db`)
- **Catálogo/Empresa**: Supabase REST API (tablas `products` e `info_empresa`)
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
│   ├── tenants.config.ts              # Config estático de 3 tenants
│   ├── app/
│   │   ├── api/
│   │   │   ├── conversations/         GET lista, DELETE conversación
│   │   │   ├── messages/[id]/         GET mensajes, POST enviar, DELETE resetear
│   │   │   ├── mode/[id]/             POST cambiar modo AI/HUMAN
│   │   │   ├── status/                GET estado conexión WhatsApp
│   │   │   └── webhook/               POST recibe mensajes YCloud/Meta
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
│   │   ├── system-prompt.ts            buildSystemPrompt(botName, companyName)
│   │   ├── send-message.ts             workerUrl param requerido (sin fallback env)
│   │   ├── catalog.ts                  Fetch Supabase productos
│   │   ├── company-info.ts             Fetch Supabase info_empresa
│   │   ├── delay.ts                    randomDelayMs + sleep
│   │   ├── openai.ts                   getAIReply
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
│       └── handle-incoming.ts          Lógica AI/HUMAN + TENANT_ID env
├── data/                               # 3 subdirectorios (uno por tenant)
│   ├── megamuebles/messages.db
│   ├── iguazufalls/messages.db
│   └── impasto/messages.db
└── ecosystem.config.js                 # PM2: 1 next + 3 workers
```

## Los 3 tenants

| ID | Email | Empresa | Bot | Worker | dataDir |
|---|---|---|---|---|---|
| megamuebles | megamuebles.lafalda@gmail.com | Mega Muebles & Sommiers | Sofía | :3001 | ./data/megamuebles |
| iguazufalls | juanynatyzapata@hotmail.com | IguazuFalls | Paula | :3002 | ./data/iguazufalls |
| impasto | spezialichristian@gmail.com | Impasto | Chris | :3003 | ./data/impasto |

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
   - Usar botName/companyName del tenant para el system prompt
3. Si modo AI → consulta catálogo + empresa → OpenAI → delay → envía
4. Dashboard (polling 10s) muestra el mensaje

## Variables de entorno

### `.env.local` — Solo vars compartidas (Next.js + todos los workers)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
WHATSAPP_PROVIDER=baileys
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

Los 3 archivos (`.env.megamuebles`, `.env.iguazufalls`, `.env.impasto`) están gitignored.
Templates disponibles en `.env.megamuebles.example` etc.

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

## Issues conocidos (pendientes de fix)
- **CRÍTICO**: `webhook/route.ts` bloquea HTTP 15-25s → YCloud puede reintentar (duplicados). Fix: fire-and-forget async.
- **IMPORTANTE**: `catalog.ts` + `company-info.ts` sin AbortSignal/timeout en fetch Supabase.

## Features del dashboard
- Theming por tenant (colores, branding)
- Lista de conversaciones con avatares de iniciales
- Toggle AI ↔ HUMANO por conversación
- Envío manual de mensajes (modo HUMAN)
- Resetear memoria IA (borra historial)
- Borrar conversación completa
- StatusWidget (estado conexión + QR Baileys)
- Polling automático cada 10s