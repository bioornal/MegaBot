# Spec: Agente WhatsApp — Mega Muebles & Sommiers

**Fecha:** 2026-04-29  
**Proyecto:** `MegaBot/agente-delivery`  
**Negocio:** Mega Muebles & Sommiers — tienda de muebles y colchones, Neuquén capital

---

## Objetivo

Agente de WhatsApp 24/7 para tienda de muebles y colchones. Recibe mensajes vía YCloud (BSP oficial de Meta), responde automáticamente con GPT-4o-mini brindando información de productos y atención profesional, y expone un dashboard web para que el operador pueda leer conversaciones, intervenir manualmente y togglear entre modo IA y modo Humano por chat.

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 App Router + TypeScript + React 19 |
| Estilos | Tailwind CSS 4 (sin librerías de componentes) |
| Base de datos | better-sqlite3 11+ (SQLite local, WAL) |
| LLM | OpenAI SDK → gpt-4o-mini |
| WhatsApp bridge | YCloud REST API (no Baileys, no Twilio) |
| Hosting | Render (Web Service + Disk persistente en `/app/data`) |
| Runtime | Node.js 20+ |

---

## Arquitectura

Único proceso Next.js. Sin servicios separados.

```
WhatsApp ↔ YCloud ↔ POST /api/webhook → SQLite → OpenAI → YCloud → WhatsApp
                                    ↕
                          Dashboard (polling 3s)
```

### Capas internas

```
agente-delivery/
├── src/
│   ├── app/
│   │   ├── page.tsx                        # Dashboard principal
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── webhook/route.ts            # POST — YCloud → servidor
│   │       ├── conversations/
│   │       │   ├── route.ts               # GET lista
│   │       │   └── [conversationId]/route.ts  # DELETE
│   │       ├── messages/[conversationId]/route.ts  # GET + POST
│   │       └── mode/[conversationId]/route.ts      # POST toggle
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── ConversationList.tsx
│   │   ├── ConversationPanel.tsx
│   │   ├── MessageBubble.tsx
│   │   └── ModeToggle.tsx
│   └── lib/
│       ├── db.ts
│       ├── ycloud.ts
│       ├── openai.ts
│       └── system-prompt.ts
└── data/                                   # gitignored, runtime
```

---

## Data Model (SQLite)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  phone            TEXT UNIQUE NOT NULL,
  name             TEXT,
  mode             TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
  last_message_at  INTEGER,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  INTEGER NOT NULL REFERENCES conversations(id),
  role             TEXT CHECK(role IN ('user','assistant','human')) NOT NULL,
  content          TEXT NOT NULL,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_messages_conv
  ON messages(conversation_id, created_at);
```

### Helpers exportados desde `db.ts`

| Helper | Descripción |
|---|---|
| `getOrCreateConversation(phone, name?)` | Upsert de conversación |
| `getConversationById(id)` | Lectura por id |
| `insertMessage(convId, role, content)` | INSERT + UPDATE last_message_at en una transacción |
| `getMessages(convId, limit=50)` | Mensajes paginados |
| `getRecentHistory(convId, limit=20)` | Últimos N en orden ASC (DESC + reverse) |
| `setMode(convId, mode)` | Toggle AI/HUMAN |
| `listConversations()` | Lista con last_message_preview (subquery) |
| `deleteConversation(id)` | Borra mensajes + conversación, transaccional |

---

## Flujo Webhook Entrante (POST /api/webhook)

1. Leer body como texto RAW (`req.text()`)
2. Verificar firma HMAC-SHA256 con `YCLOUD_WEBHOOK_SECRET` → 401 si falla
3. Parsear JSON
4. Ignorar silenciosamente (200 ok) si:
   - `body.type !== 'whatsapp'`
   - `body.payload?.type !== 'text'`
   - No existe `body.payload?.text?.body`
5. Extraer `phone`, `name`, `text`
6. `getOrCreateConversation(phone, name)`
7. `insertMessage(convo.id, 'user', text)`
8. Re-leer conversación (`getConversationById`) para modo actual
9. Si modo `AI`:
   - `getRecentHistory(convo.id, 20)` → mapear `human → assistant` para el LLM
   - Llamar OpenAI con system prompt + historial
   - `insertMessage(convo.id, 'assistant', reply)`
   - `sendWhatsAppMessage(phone, reply)`
10. Devolver `{ ok: true }` con 200 **siempre** (YCloud reintenta si recibe error)

> **Crítico:** el webhook NUNCA devuelve 4xx/5xx por errores internos — solo por firma inválida. Los errores internos se loguean y devuelven 200 igual.

---

## Flujo Mensaje Humano (POST /api/messages/[conversationId])

Body: `{ content: string }`

1. Validar que conversación existe y está en modo `HUMAN`
2. `insertMessage(conversationId, 'human', content)`
3. `sendWhatsAppMessage(phone, content)`
4. Devolver `{ ok: true, messageId }` o 502 si YCloud falla

---

## API Endpoints

| Método | Path | Descripción |
|---|---|---|
| `POST` | `/api/webhook` | Recibe mensajes de YCloud |
| `GET` | `/api/conversations` | Lista conversaciones |
| `DELETE` | `/api/conversations/[id]` | Borra conversación + mensajes |
| `GET` | `/api/messages/[id]` | Lista mensajes de una conversación |
| `POST` | `/api/messages/[id]` | Envía mensaje humano |
| `POST` | `/api/mode/[id]` | Cambia modo AI/HUMAN |

> **Next.js 15:** todos los route handlers con segmento dinámico usan `params: Promise<{...}>` y `await params`.

---

## UI Dashboard

Paleta oscura, Tailwind 4 puro, sin shadcn ni Radix.

| Color | Uso |
|---|---|
| `#0f1117` | Fondo general |
| `#161b22` | Sidebar / ConversationList |
| `#1c2128` | Panel de conversación |
| `#10b981` | Acento modo AI (esmeralda) |
| `#f59e0b` | Acento modo HUMAN (ámbar) |

### Componentes

- **Dashboard** — estado global, polling, layout principal
- **ConversationList** — badge IA/HUMAN, timestamp relativo, preview 40 chars, activa resaltada
- **ConversationPanel** — mensajes, input habilitado solo en HUMAN, banner en modo AI, botón borrar con confirmación
- **MessageBubble** — `user` izquierda gris, `assistant` derecha esmeralda, `human` derecha ámbar con badge "Operador"
- **ModeToggle** — switch prominente arriba del panel, feedback visual inmediato

### Polling

```
setInterval(3s) → GET /api/conversations + GET /api/messages/[id]
Pausar si document.hidden
Cleanup en useEffect return
```

---

## Variables de Entorno

```env
YCLOUD_API_KEY=
YCLOUD_PHONE_NUMBER_ID=
YCLOUD_WEBHOOK_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

---

## Sistema Prompt (placeholder)

Español rioplatense. Negocio: Mega Muebles & Sommiers, Neuquén capital. Atención 24/7, información de productos (muebles y colchones/sommiers), asesoramiento profesional. Incluye lógica de derivación a operador humano con frase exacta gatilladora. Personalizar con catálogo real, horarios de local, financiación disponible y zona de entrega antes de producción.

---

## Deploy en Render

1. Web Service desde repo GitHub
2. Build: `npm install && npm run build`
3. Start: `npm run start`
4. Env vars en panel Render
5. **Disk persistente montado en `/app/data`** — crítico, sin esto cada deploy borra la DB
6. URL pública → configurar en YCloud como webhook URL: `https://<app>.onrender.com/api/webhook`

> Plan gratuito hace sleep tras 15 min inactividad. Recomendado: Starter ($7/mes).

---

## Seguridad

- **Dashboard sin autenticación** — BLOQUEANTE antes de producción. Opciones: middleware Next.js con basic auth, o Cloudflare Access delante.
- **Firma HMAC obligatoria** en webhook — impide POST falsos.

---

## Mejoras Pendientes (fuera de scope v1)

- Autenticación en dashboard
- Soporte mensajes de imagen/audio de WhatsApp
- Notificaciones push cuando llega mensaje en modo HUMAN
- Historial exportable
- Multi-tenant (varios números)
