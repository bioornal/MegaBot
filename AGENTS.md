# MegaBot — Contexto para Agentes (OpenCode, Gemini CLI, etc.)

## Qué es
Dashboard multi-tenant de operador para **3 empresas independientes** con WhatsApp bots IA:
- **Mega Muebles & Sommiers** (Neuquén) — Bot Sofía, worker :3001
- **IguazuFalls** (turismo) — Bot Paula, worker :3002  
- **Impasto** (restaurant) — Bot Chris, worker :3003

Cada tenant tiene su propia SIM, Baileys session, SQLite DB, y tablas propias (Supabase o Insforge).

## Estado actual (2026-05-06)
✅ Multi-tenant fully operational en VPS Hostinger (2.24.72.12)
✅ Los 3 bots responden con data propia
✅ Saludo único fixeado (no repetir)
✅ PM2 env cacheing y RLS gotchas resueltos
✅ Impasto migrado a Insforge (catálogo separado de Supabase)

## Tech stack
- **Frontend**: Next.js 15 (App Router), React, Tailwind CSS v4
- **Bot/Worker**: Node.js + tsx, 3 procesos (one per tenant)
- **WhatsApp**: Baileys (JS web scraper) por defecto, YCloud como alternativa
- **AI**: OpenAI API (gpt-4o-mini, max_tokens: 200, temperature: 0.4)
- **DB**: SQLite via better-sqlite3 (`data/{tenant}/messages.db`)
- **Catálogo**: Supabase (megamuebles, iguazufalls) + **Insforge** (Impasto)
- **Auth**: Supabase Auth + httpOnly cookie `tenant-id`
- **PM2**: 4 procesos en prod (1 Next.js + 3 workers)

## Arquitectura clave

### Env files (CRITICAL)
- `.env.local` = vars compartidas (OPENAI_API_KEY, SUPABASE_*, WHATSAPP_PROVIDER)
- `.env.{tenant}` = vars por tenant (TENANT_ID, WORKER_PORT, DATA_DIR, etc.)
  - Cada worker carga su env via `--env-file=.env.{tenant}` en ecosystem.config.js
  - **NUNCA poner TENANT_ID en `.env.local`** — contamina todos los workers
  - Gitignored, templates en `.env.*.example`

### Deployment (VPS Hostinger)
**Deploy código normal:**
```bash
ssh root@2.24.72.12
cd MegaBot/agente-delivery
git pull && npm run build && pm2 restart all
```

**Deploy con cambios env o ecosystem.config.js:**
```bash
pm2 kill && pm2 start ecosystem.config.js
```

**Bootstrap completo (primera vez):**
```bash
bash scripts/setup-vps.sh
```

**Rotar OpenAI key:**
```bash
NEW_KEY=sk-proj-...
sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$NEW_KEY|" .env.local .env.megamuebles .env.iguazufalls .env.impasto
pm2 kill && pm2 start ecosystem.config.js
```

## Flujo de mensaje

1. WhatsApp entra vía Baileys → `handleIncoming(msg, provider)`
2. `handle-incoming.ts` carga DB + sistema prompt usando TENANT_ID del env
3. Si modo AI:
   - Fetch catálogo + company info desde Supabase o **Insforge** (según `dataSource` del tenant)
   - OpenAI con full system prompt
   - Delay (3-20s random si `AI_REPLY_DELAY=true`)
   - Envía respuesta
4. Dashboard (polling 10s) muestra el mensaje

## Bots — System prompts

Cada bot tiene un prompt específico en `src/lib/system-prompt.ts`:
- **Sofía** (Mega Muebles): vende muebles/colchones, precios en cuotas/efectivo, info catálogo Supabase
- **Paula** (IguazuFalls): vende paquetes turísticos a Cataratas, disponibilidad en asesor
- **Chris** (Impasto): restaurant italiano, menú + delivery, consultar alérgenos con asesor

**REGLA CRÍTICA en todos:** Saludarse UNA SOLA VEZ al inicio. NUNCA repetir el saludo.

## Bugs resueltos
- Cross-tenant data leak (workerUrl priority invertida)
- PM2 env cacheing (necesita `pm2 kill`, no basta restart)
- Supabase RLS sin policies para anon
- catalog.ts retry logic para FK missing en tablas nuevas
- Sofia greeting repetida (explicit CRITICAL RULE en prompt)

## Gotchas importantes
1. **PM2 cachea env del primer spawn** — si cambias .env, necesitás `pm2 kill + pm2 start`, no basta `restart`
2. **`tsx --env-file` NO override process.env existente** — Node respeta vars existentes
3. **Supabase RLS bloquea anon sin policy** — devuelve array vacío silenciosamente
4. **Mismo browser = mismo tenant** — Supabase Auth cookie compartida entre tabs. Usar 2 perfiles Chrome distintos para ver 2 tenants simultáneos

## Pendiente — Anti-ban features
Para evitar bloqueo de SIM por Meta. Por implementar en próxima sesión:
1. Activar `AI_REPLY_DELAY=true` en VPS (setup-vps.sh + .env.{tenant})
2. **Typing indicator** — `sock.sendPresenceUpdate('composing')` antes de enviar
3. **Read receipt** — `sock.readMessages()` al recibir
4. **Delay proporcional** — escalar 3-20s según longitud del reply

## Cómo empezar

**Desarrollo local:**
```bash
cd agente-delivery
npm install
npm run dev  # arranca Next.js :3000 + worker :3001 automáticamente
```

**Acceder al dashboard:**
- http://localhost:3000
- Login con cualquier email de tenant en tenants.config.ts (ej: megamuebles.lafalda@gmail.com / password)
- Escanear QR con la SIM correspondiente

**Logs en vivo:**
```bash
pm2 logs worker-megamuebles  # logs del worker de megamuebles
pm2 logs all                 # todos
```

## Archivos clave
- `CLAUDE.md` — Contexto detallado del proyecto (léelo completo)
- `agente-delivery/tenants.config.ts` — Config estática de 3 tenants
- `agente-delivery/ecosystem.config.js` — PM2 config (1 next + 3 workers con --env-file)
- `agente-delivery/src/lib/system-prompt.ts` — Prompts de los 3 bots
- `agente-delivery/scripts/setup-vps.sh` — Bootstrap multi-tenant idempotente
- `agente-delivery/src/providers/baileys.ts` — WhatsApp provider Baileys
- `agente-delivery/src/worker/handle-incoming.ts` — Lógica AI/HUMAN core
