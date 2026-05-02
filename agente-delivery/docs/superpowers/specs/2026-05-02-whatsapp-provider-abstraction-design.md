# MegaBot — WhatsApp Provider Abstraction Design

**Date:** 2026-05-02  
**Branch:** feat/agente-whatsapp  
**Status:** Approved

---

## Overview

Refactor MegaBot to treat WhatsApp as an interchangeable transport layer via a common `WhatsAppProvider` interface. Today's provider is Baileys (for local testing and Render deployment while Meta API access is blocked). The architecture makes switching to YCloud or the official Meta API a matter of changing one environment variable and running the Next.js-only flow (no worker needed).

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  Next.js :3000                               │
│  ├── /api/webhook   ← YCloud only (unchanged)│
│  ├── /api/status    ← proxy to worker :3001  │
│  ├── /api/messages  ← send via provider      │
│  └── dashboard (unchanged + StatusWidget)    │
└──────────────────────┬───────────────────────┘
                       │ SQLite (data/messages.db)
┌──────────────────────┴───────────────────────┐
│  Worker Node.js :3001                        │
│  ├── providers/baileys.ts  ← live WS socket  │
│  ├── providers/ycloud.ts   ← outgoing adapter│
│  ├── providers/meta.ts     ← stub            │
│  ├── handle-incoming.ts   ← AI/HUMAN logic   │
│  └── HTTP: GET /status, POST /send           │
└──────────────────────────────────────────────┘
```

The worker is only started when `WHATSAPP_PROVIDER=baileys`. For `ycloud` or `meta`, Next.js handles everything directly (current behavior), and the worker is not used.

---

## Provider Interface

File: `src/providers/types.ts`

```typescript
export type ProviderName = 'baileys' | 'ycloud' | 'meta';
export type ProviderStatus = 'connecting' | 'connected' | 'disconnected' | 'waiting_qr' | 'error';

export interface IncomingMessage {
  provider: ProviderName;
  externalMessageId: string;
  from: string;          // E.164 format: "5491112345678"
  to: string;
  text: string;
  timestamp: number;     // unix epoch seconds
  rawPayload: unknown;
}

export interface WhatsAppProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(to: string, text: string): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  getStatus(): ProviderStatus;
  getQrCode?(): string | null;  // only implemented by Baileys
}
```

Business logic never imports from `providers/baileys.ts` directly. All contact goes through this interface.

---

## File Structure

### New files
```
src/providers/
├── types.ts           ← interface + IncomingMessage + ProviderStatus
├── baileys.ts         ← Baileys adapter (jid, auth, events isolated here)
├── ycloud.ts          ← outgoing adapter wrapping existing lib/ycloud.ts
├── meta.ts            ← stub (throws NotImplementedError)
└── factory.ts         ← creates provider from WHATSAPP_PROVIDER env var

src/worker/
├── index.ts           ← entry: boots provider, registers handler, starts HTTP :3001
├── handle-incoming.ts ← AI/HUMAN logic extracted from /api/webhook/route.ts
└── tsconfig.json      ← separate tsconfig for ts-node:
                          {
                            "extends": "../../tsconfig.json",
                            "compilerOptions": {
                              "module": "CommonJS",
                              "outDir": "../../dist/worker",
                              "baseUrl": "../",
                              "paths": { "@/*": ["./*"] }
                            },
                            "include": ["./**/*", "../providers/**/*", "../lib/**/*"]
                          }

src/app/api/status/
└── route.ts           ← GET: proxy to worker /status OR return ycloud connected

src/components/
└── StatusWidget.tsx   ← connection status + QR canvas (polls /api/status every 3s)

src/lib/
└── send-message.ts    ← routes outgoing: baileys → worker POST /send, ycloud → direct
```

### Modified files
```
src/app/api/webhook/route.ts       ← early-return 200 if WHATSAPP_PROVIDER=baileys
src/app/api/messages/[id]/route.ts ← use send-message.ts instead of ycloud.ts directly
src/components/Dashboard.tsx       ← add <StatusWidget /> in header
package.json                       ← add deps + scripts
.env.example                       ← add new vars
.gitignore                         ← add data/baileys-auth/
```

### Unchanged files
`db.ts`, `openai.ts`, `system-prompt.ts`, `types.ts`, all conversation components, `ConversationList`, `ConversationPanel`, `MessageBubble`, `ModeToggle`.

---

## Baileys Provider (`providers/baileys.ts`)

Encapsulates all Baileys-specific concepts:
- `useMultiFileAuthState` from `data/baileys-auth/`
- `makeWASocket` connection setup
- `jid` ↔ phone number conversion (`jid.split('@')[0]`)
- Event handlers: `connection.update`, `messages.upsert`
- Reconnection with exponential backoff (1s → 2s → 4s → max 30s)
- On `DisconnectReason.loggedOut`: deletes auth state, re-emits QR flow
- QR stored in memory as a string, cleared on connect

Status transitions:
```
start() called → 'connecting'
connection.update: qr emitted → 'waiting_qr'
connection.update: open → 'connected'
connection.update: close (retriable) → 'connecting' (auto-reconnect)
connection.update: close (loggedOut) → 'waiting_qr' (after auth reset)
unhandled error → 'error'
```

---

## Worker (`worker/index.ts`)

Boot sequence:
1. Read `WHATSAPP_PROVIDER` → instantiate via `factory.ts`
2. Register `onMessage(handleIncoming)` handler
3. Call `provider.start()`
4. Start HTTP server on `WORKER_PORT` (default 3001)

HTTP endpoints (internal only, not exposed publicly):
- `GET /status` → `{ status: ProviderStatus, provider: ProviderName, qr?: string }`
- `POST /send` → `{ to: string, text: string }` → `provider.sendMessage(to, text)`

---

## handle-incoming.ts

Extracted from the current `/api/webhook/route.ts` handler. Receives a normalized `IncomingMessage` and a `WhatsAppProvider` reference:

```
1. getOrCreateConversation(msg.from)
2. insertMessage(conversationId, 'user', msg.text)
3. if mode === 'HUMAN': return (no auto-reply)
4. history = getRecentHistory(conversationId, 20)
5. reply = getAIReply(history, SYSTEM_PROMPT)
6. insertMessage(conversationId, 'assistant', reply)
7. provider.sendMessage(msg.from, reply)
```

The `/api/webhook/route.ts` for YCloud will be refactored to call `handleIncoming()` with a normalized message instead of duplicating this logic.

---

## send-message.ts

Routes outgoing messages based on `WHATSAPP_PROVIDER`:

```typescript
export async function sendMessage(to: string, text: string): Promise<void> {
  if (process.env.WHATSAPP_PROVIDER === 'baileys') {
    await fetch(`${WORKER_INTERNAL_URL}/send`, { method: 'POST', body: JSON.stringify({ to, text }) });
  } else {
    await sendWhatsAppMessage(to, text); // existing ycloud.ts function
  }
}
```

---

## StatusWidget (Dashboard)

Polls `GET /api/status` every 3 seconds (same pattern as conversation polling).

Visual states:
| Status | Color | Display |
|---|---|---|
| `connected` | green | "WhatsApp conectado · [provider]" |
| `connecting` | yellow | "Conectando…" |
| `waiting_qr` | blue | QR rendered via `qrcode` library on `<canvas>` |
| `disconnected` | red | "Desconectado — reiniciando" |
| `error` | red | "Error: [message]" |

When `WHATSAPP_PROVIDER=ycloud`, `/api/status` returns `{ status: 'connected', provider: 'ycloud' }` without calling the worker, and no QR is shown.

---

## Environment Variables

```bash
# Required
OPENAI_API_KEY=                    # already configured

# WhatsApp provider selection
WHATSAPP_PROVIDER=baileys          # baileys | ycloud | meta

# Baileys only
WORKER_INTERNAL_URL=http://localhost:3001
WORKER_PORT=3001
DATA_DIR=./data                    # baileys-auth stored here

# YCloud (only if WHATSAPP_PROVIDER=ycloud)
YCLOUD_API_KEY=
YCLOUD_PHONE_NUMBER_ID=
YCLOUD_WEBHOOK_SECRET=

# OpenAI
OPENAI_MODEL=gpt-4o-mini
```

---

## Local Development

```bash
# Install dependencies
npm install

# Set up env
cp .env.example .env.local
# Edit .env.local: set OPENAI_API_KEY, leave WHATSAPP_PROVIDER=baileys

# Run both processes
npm run dev:all

# Open dashboard → see QR in header → scan with WhatsApp
# http://localhost:3000
```

**npm scripts added:**
```json
"dev:all":      "concurrently \"npm run dev\" \"npm run worker:dev\"",
"worker:dev":   "ts-node --project src/worker/tsconfig.json src/worker/index.ts",
"worker:build": "tsc --project src/worker/tsconfig.json --outDir dist/worker",
"worker:start": "node dist/worker/index.js"
```

---

## Migrating back to YCloud or Meta

1. Set `WHATSAPP_PROVIDER=ycloud` (or `meta`) in `.env.local`
2. Add `YCLOUD_API_KEY`, `YCLOUD_PHONE_NUMBER_ID`, `YCLOUD_WEBHOOK_SECRET`
3. Do NOT run the worker (`npm run dev` only, not `dev:all`)
4. Configure the YCloud webhook to point to `/api/webhook`
5. The dashboard, AI logic, database, and mode switching are identical — nothing changes

For Meta (official API): implement `providers/meta.ts` following the same `WhatsAppProvider` interface. The webhook route already handles signature verification; adapt it for Meta's format.

---

## Render Deployment

- **Web Service:** runs `npm run build && npm start` (Next.js)
- **Background Worker:** runs `npm run worker:start` (Node.js)
- Both services mount the same **Persistent Disk** at `/data`
- `DATA_DIR=/data` in both service env vars
- `WORKER_INTERNAL_URL` points to the internal Render hostname of the worker service

---

## Security Notes

⚠️ **Baileys is not the official WhatsApp Business API.** It is a reverse-engineered library. Using it risks account bans, especially on numbers with high message volume or patterns that trigger Meta's spam detection. Use only on a test/dedicated number until official API access is established.

- `data/baileys-auth/` is gitignored — never commit session credentials
- The worker HTTP (`:3001`) must not be exposed publicly — bind to `localhost` or use Render internal networking
- QR codes displayed in the dashboard are ephemeral and expire in ~20 seconds
