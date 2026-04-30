# Agente WhatsApp Mega Muebles & Sommiers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a WhatsApp AI agent + operator dashboard for Mega Muebles & Sommiers (Neuquén), using YCloud + GPT-4o-mini + Next.js 15 + SQLite, deployable on Render.

**Architecture:** Single Next.js 15 process. YCloud bridges WhatsApp ↔ server via webhook POST + REST API. SQLite (WAL, better-sqlite3) stores all conversations and messages locally. Dashboard polls every 3s for updates. No WebSockets, no external DB.

**Tech Stack:** Next.js 15 App Router, TypeScript, React 19, Tailwind CSS 4, better-sqlite3 11+, OpenAI SDK, Node.js 20+.

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Deps, scripts, engines (node >=20.9.0) |
| `.env.example` | Env var template |
| `.gitignore` | Exclude node_modules, .next, data/, .env.local |
| `tsconfig.json` | TypeScript config with `@/*` path alias |
| `next.config.ts` | `serverExternalPackages: ["better-sqlite3"]` |
| `postcss.config.mjs` | Tailwind 4 PostCSS plugin |
| `src/types.ts` | Shared TS interfaces (Conversation, Message) |
| `src/lib/db.ts` | SQLite init + DDL + all DB helpers |
| `src/lib/ycloud.ts` | `sendWhatsAppMessage()` via YCloud REST |
| `src/lib/openai.ts` | `getAIReply()` via OpenAI SDK |
| `src/lib/system-prompt.ts` | SYSTEM_PROMPT for Mega Muebles & Sommiers |
| `src/app/api/webhook/route.ts` | POST — raw body, HMAC verify, save + AI reply |
| `src/app/api/conversations/route.ts` | GET — list all conversations |
| `src/app/api/conversations/[conversationId]/route.ts` | DELETE — conversation + messages |
| `src/app/api/messages/[conversationId]/route.ts` | GET messages / POST human message |
| `src/app/api/mode/[conversationId]/route.ts` | POST — toggle AI/HUMAN |
| `src/components/ModeToggle.tsx` | AI/HUMAN toggle button with color feedback |
| `src/components/MessageBubble.tsx` | Single message bubble (user/assistant/human) |
| `src/components/ConversationList.tsx` | Left sidebar list with badge + preview |
| `src/components/ConversationPanel.tsx` | Right panel: messages + input + delete modal |
| `src/components/Dashboard.tsx` | Root client component: state, polling, layout |
| `src/app/layout.tsx` | HTML shell, metadata |
| `src/app/globals.css` | Tailwind import + base resets |
| `src/app/page.tsx` | Renders `<Dashboard />` |
| `README.md` | Setup, YCloud config, Render deploy, security warning |

---

## Task 1: Project Scaffold + Config Files

**Files:**
- Create: `agente-delivery/package.json`
- Create: `agente-delivery/.env.example`
- Create: `agente-delivery/.gitignore`
- Create: `agente-delivery/tsconfig.json`
- Create: `agente-delivery/next.config.ts`
- Create: `agente-delivery/postcss.config.mjs`

- [ ] **Step 1: Create the project directory**

```bash
mkdir -p /c/Users/spezi/Desktop/MegaBot/agente-delivery
cd /c/Users/spezi/Desktop/MegaBot/agente-delivery
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "agente-delivery",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": ">=20.9.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "better-sqlite3": "^11.0.0",
    "openai": "^4.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0"
  }
}
```

- [ ] **Step 3: Create `.env.example`**

```
# YCloud — panel.ycloud.com → Settings → API Keys
YCLOUD_API_KEY=

# YCloud — panel.ycloud.com → WhatsApp → Phone Numbers
YCLOUD_PHONE_NUMBER_ID=

# YCloud — generado al configurar el webhook en YCloud
YCLOUD_WEBHOOK_SECRET=

# OpenAI — platform.openai.com → API Keys
OPENAI_API_KEY=

# Modelo a usar (no cambiar para v1)
OPENAI_MODEL=gpt-4o-mini
```

- [ ] **Step 4: Create `.gitignore`**

```
/node_modules
/.next/
/out/
/build
.env
.env.local
.env.*.local
/data/
.DS_Store
*.pem
npm-debug.log*
```

- [ ] **Step 5: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 6: Create `next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

- [ ] **Step 7: Create `postcss.config.mjs`**

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 8: Create `.env.local` from example**

```bash
cp .env.example .env.local
# Completar los valores reales en .env.local antes de npm run dev
```

- [ ] **Step 9: Install dependencies** (tarda ~1 min por compilación nativa de better-sqlite3)

```bash
npm install
```

Expected: `added N packages` sin errores. Si hay error de compilación nativa, verificar que `node --version` sea >= 20.9.0.

- [ ] **Step 10: Commit**

```bash
cd /c/Users/spezi/Desktop/MegaBot
git add agente-delivery/
git commit -m "feat: scaffold agente-delivery — config files + deps"
```

---

## Task 2: Shared Types + DB Layer

**Files:**
- Create: `src/types.ts`
- Create: `src/lib/db.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  last_message_at: number | null;
  created_at: number;
}

export interface ConversationWithPreview extends Conversation {
  last_message_preview: string | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "human";
  content: string;
  created_at: number;
}
```

- [ ] **Step 2: Create `src/lib/db.ts`**

```typescript
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Conversation, ConversationWithPreview, Message } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "messages.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
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
`);

const stmts = {
  upsertConversation: db.prepare(`
    INSERT INTO conversations (phone, name) VALUES (?, ?)
    ON CONFLICT(phone) DO UPDATE SET name = COALESCE(excluded.name, conversations.name)
    RETURNING *
  `),
  getConversationById: db.prepare(
    `SELECT * FROM conversations WHERE id = ?`
  ),
  setMode: db.prepare(
    `UPDATE conversations SET mode = ? WHERE id = ?`
  ),
  listConversations: db.prepare(`
    SELECT c.*,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_preview
    FROM conversations c
    ORDER BY COALESCE(c.last_message_at, 0) DESC
  `),
  insertMessage: db.prepare(`
    INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)
    RETURNING *
  `),
  updateLastMessageAt: db.prepare(
    `UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?`
  ),
  getMessages: db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?
  `),
  getRecentHistoryDesc: db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?
  `),
  deleteMessages: db.prepare(
    `DELETE FROM messages WHERE conversation_id = ?`
  ),
  deleteConversation: db.prepare(
    `DELETE FROM conversations WHERE id = ?`
  ),
};

export function getOrCreateConversation(
  phone: string,
  name?: string
): Conversation {
  return stmts.upsertConversation.get(phone, name ?? null) as Conversation;
}

export function getConversationById(id: number): Conversation | null {
  return (stmts.getConversationById.get(id) as Conversation) ?? null;
}

const insertMessageTx = db.transaction(
  (conversationId: number, role: string, content: string): Message => {
    const msg = stmts.insertMessage.get(
      conversationId,
      role,
      content
    ) as Message;
    stmts.updateLastMessageAt.run(conversationId);
    return msg;
  }
);

export function insertMessage(
  conversationId: number,
  role: "user" | "assistant" | "human",
  content: string
): Message {
  return insertMessageTx(conversationId, role, content);
}

export function getMessages(
  conversationId: number,
  limit = 50
): Message[] {
  return stmts.getMessages.all(conversationId, limit) as Message[];
}

export function getRecentHistory(
  conversationId: number,
  limit = 20
): Message[] {
  const rows = stmts.getRecentHistoryDesc.all(
    conversationId,
    limit
  ) as Message[];
  return rows.reverse();
}

export function setMode(
  conversationId: number,
  mode: "AI" | "HUMAN"
): void {
  stmts.setMode.run(mode, conversationId);
}

export function listConversations(): ConversationWithPreview[] {
  return stmts.listConversations.all() as ConversationWithPreview[];
}

const deleteConversationTx = db.transaction((id: number) => {
  stmts.deleteMessages.run(id);
  stmts.deleteConversation.run(id);
});

export function deleteConversation(id: number): void {
  deleteConversationTx(id);
}
```

- [ ] **Step 3: Write DB test script `src/lib/db.test.mjs`**

```js
// Script de verificación — ejecutar con: node src/lib/db.test.mjs
// Usa DB en memoria (archivo temporal), no toca data/messages.db

import Database from "better-sqlite3";
import assert from "node:assert/strict";
import fs from "node:fs";

// --- setup in-memory DB ---
const db = new Database(":memory:");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    mode TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
    last_message_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    role TEXT CHECK(role IN ('user','assistant','human')) NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

const upsert = db.prepare(`
  INSERT INTO conversations (phone, name) VALUES (?, ?)
  ON CONFLICT(phone) DO UPDATE SET name = COALESCE(excluded.name, conversations.name)
  RETURNING *
`);
const insertMsg = db.prepare(`INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?) RETURNING *`);
const updateTs = db.prepare(`UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?`);
const insertTx = db.transaction((cid, role, content) => {
  const m = insertMsg.get(cid, role, content);
  updateTs.run(cid);
  return m;
});
const getMsgs = db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`);
const setMode = db.prepare(`UPDATE conversations SET mode = ? WHERE id = ?`);
const getById = db.prepare(`SELECT * FROM conversations WHERE id = ?`);
const list = db.prepare(`SELECT c.*, (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_preview FROM conversations c ORDER BY COALESCE(c.last_message_at,0) DESC`);
const delMsgs = db.prepare(`DELETE FROM messages WHERE conversation_id = ?`);
const delConv = db.prepare(`DELETE FROM conversations WHERE id = ?`);
const delTx = db.transaction((id) => { delMsgs.run(id); delConv.run(id); });

// --- tests ---
const c1 = upsert.get("5491155667788", "Juan");
assert.equal(c1.phone, "5491155667788");
assert.equal(c1.name, "Juan");
assert.equal(c1.mode, "AI");

// idempotente — mismo id
const c2 = upsert.get("5491155667788", null);
assert.equal(c2.id, c1.id);
assert.equal(c2.name, "Juan"); // nombre preservado con COALESCE

// insert mensaje
const m1 = insertTx(c1.id, "user", "Hola quiero info de sommiers");
assert.equal(m1.role, "user");
assert.equal(m1.content, "Hola quiero info de sommiers");

const msgs = getMsgs.all(c1.id, 50);
assert.equal(msgs.length, 1);

// setMode
setMode.run("HUMAN", c1.id);
const fresh = getById.get(c1.id);
assert.equal(fresh.mode, "HUMAN");

// listConversations
const rows = list.all();
assert.ok(rows.find(r => r.id === c1.id));
assert.equal(rows[0].last_message_preview, "Hola quiero info de sommiers");

// deleteConversation
delTx(c1.id);
const rows2 = list.all();
assert.ok(!rows2.find(r => r.id === c1.id));

console.log("✓ Todos los tests de DB pasaron");
```

- [ ] **Step 4: Run DB test**

```bash
cd /c/Users/spezi/Desktop/MegaBot/agente-delivery
node src/lib/db.test.mjs
```

Expected: `✓ Todos los tests de DB pasaron`

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores (puede haber warnings de módulos faltantes, eso es ok en este paso).

- [ ] **Step 6: Commit**

```bash
cd /c/Users/spezi/Desktop/MegaBot
git add agente-delivery/src/
git commit -m "feat: types + db layer — SQLite WAL + todos los helpers"
```

---

## Task 3: External Integrations

**Files:**
- Create: `src/lib/ycloud.ts`
- Create: `src/lib/openai.ts`
- Create: `src/lib/system-prompt.ts`

- [ ] **Step 1: Create `src/lib/ycloud.ts`**

```typescript
export async function sendWhatsAppMessage(
  to: string,
  text: string
): Promise<void> {
  const res = await fetch("https://api.ycloud.com/v2/whatsapp/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.YCLOUD_API_KEY!,
    },
    body: JSON.stringify({
      from: process.env.YCLOUD_PHONE_NUMBER_ID,
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YCloud API error ${res.status}: ${err}`);
  }
}
```

- [ ] **Step 2: Create `src/lib/openai.ts`**

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getAIReply(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string
): Promise<string> {
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}
```

- [ ] **Step 3: Create `src/lib/system-prompt.ts`**

```typescript
export const SYSTEM_PROMPT = `
Sos el asistente virtual de Mega Muebles & Sommiers, una tienda de muebles y colchones ubicada en Neuquén capital. Tu nombre es "Asistente". Respondés en español rioplatense, en mensajes breves de 2 a 4 líneas. No uses emojis en exceso. Sos amable, profesional y estás disponible las 24 horas.

Podés ayudar con:
- Consultas sobre productos (muebles de dormitorio, living, comedor, sommiers y colchones)
- Información de precios y opciones de financiación disponibles
- Horarios del local y zona de entrega en Neuquén capital
- Coordinar visitas al showroom

Si el cliente quiere concretar una compra, necesita asesoramiento personalizado o tiene una consulta que no podés resolver, respondé exactamente:
"Ahora te comunico con un asesor, ¡un momento!"

El operador del dashboard verá ese mensaje y tomará el control del chat.

IMPORTANTE: Personalizá este prompt con el catálogo real, precios, financiación, horarios y zona de entrega antes de usar en producción.
`.trim();
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores en los archivos nuevos.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/spezi/Desktop/MegaBot
git add agente-delivery/src/lib/
git commit -m "feat: ycloud + openai + system-prompt para Mega Muebles"
```

---

## Task 4: Webhook Route (CRÍTICO)

**Files:**
- Create: `src/app/api/webhook/route.ts`

- [ ] **Step 1: Create directories**

```bash
mkdir -p /c/Users/spezi/Desktop/MegaBot/agente-delivery/src/app/api/webhook
```

- [ ] **Step 2: Create `src/app/api/webhook/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  getOrCreateConversation,
  insertMessage,
  getConversationById,
  getRecentHistory,
} from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/ycloud";
import { getAIReply } from "@/lib/openai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

function verifySignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-ycloud-signature") ?? "";

  if (
    !verifySignature(
      rawBody,
      signature,
      process.env.YCLOUD_WEBHOOK_SECRET!
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody);

    if (
      body.type !== "whatsapp" ||
      body.payload?.type !== "text" ||
      !body.payload?.text?.body
    ) {
      return NextResponse.json({ ok: true });
    }

    const phone: string = body.payload.from;
    const name: string | undefined = body.payload.contact?.name;
    const messageText: string = body.payload.text.body;

    console.log(
      `[webhook] ← Mensaje de ${phone} (${name ?? "sin nombre"}): "${messageText}"`
    );

    const convo = getOrCreateConversation(phone, name);
    insertMessage(convo.id, "user", messageText);

    const fresh = getConversationById(convo.id);
    if (!fresh || fresh.mode !== "AI") {
      return NextResponse.json({ ok: true });
    }

    const history = getRecentHistory(convo.id, 20);
    const llmMessages = history.map((m) => ({
      role: (m.role === "human" ? "assistant" : m.role) as
        | "user"
        | "assistant",
      content: m.content,
    }));

    console.log(
      `[webhook] llamando LLM con ${llmMessages.length} mensajes...`
    );
    const start = Date.now();
    const reply = await getAIReply(llmMessages, SYSTEM_PROMPT);
    console.log(`[webhook] LLM respondió en ${Date.now() - start}ms`);

    insertMessage(convo.id, "assistant", reply);
    await sendWhatsAppMessage(phone, reply);
    console.log(`[webhook] → Enviado a ${phone}`);
  } catch (err) {
    console.error("[webhook] Error interno:", err);
    // NO re-throw — YCloud reintenta si recibe 4xx/5xx
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Test HMAC signature generation**

Generar un body + firma de prueba con Node:

```bash
node -e "
const crypto = require('crypto');
const secret = 'test_secret_12345';
const body = JSON.stringify({
  type: 'whatsapp',
  payload: {
    id: 'msg_test_001',
    from: '5492994001234',
    to: '5492990000000',
    type: 'text',
    text: { body: 'Hola, quiero info de sommiers' },
    timestamp: 1714000000,
    contact: { name: 'María García' }
  }
});
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
console.log('BODY:', body);
console.log('SIG:', sig);
"
```

Guardar el output — se usa en Step 4.

- [ ] **Step 4: Start dev server and test webhook**

En una terminal:
```bash
cd /c/Users/spezi/Desktop/MegaBot/agente-delivery
npm run dev
```

En otra terminal (reemplazar `<SIG>` y `<BODY>` con el output del Step 3):
```bash
# Primero: firma correcta → debe retornar {"ok":true}
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "X-YCloud-Signature: <SIG>" \
  -d '<BODY>'
```

Expected: `{"ok":true}` — y en la terminal del server: logs `[webhook] ← Mensaje de 5492994001234...`

```bash
# Segundo: firma incorrecta → debe retornar 401
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "X-YCloud-Signature: firma_invalida" \
  -d '<BODY>'
```

Expected: `{"error":"Unauthorized"}` con status 401.

> **Nota:** El LLM fallará si `OPENAI_API_KEY` no está seteada. Eso es esperado — el error se loguea internamente y el webhook devuelve 200 igual.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/spezi/Desktop/MegaBot
git add agente-delivery/src/app/api/webhook/
git commit -m "feat: webhook — HMAC verify + save + AI reply flow"
```

---

## Task 5: Conversations API

**Files:**
- Create: `src/app/api/conversations/route.ts`
- Create: `src/app/api/conversations/[conversationId]/route.ts`

- [ ] **Step 1: Create directories**

```bash
mkdir -p /c/Users/spezi/Desktop/MegaBot/agente-delivery/src/app/api/conversations/\[conversationId\]
```

- [ ] **Step 2: Create `src/app/api/conversations/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { listConversations } from "@/lib/db";

export async function GET() {
  const conversations = listConversations();
  return NextResponse.json(conversations);
}
```

- [ ] **Step 3: Create `src/app/api/conversations/[conversationId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { deleteConversation, getConversationById } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  deleteConversation(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Test conversations API** (dev server corriendo)

```bash
# Listar conversaciones — debe incluir el mensaje de prueba del Task 4
curl http://localhost:3000/api/conversations

# Borrar conversación id=1 (usar el id real del output anterior)
curl -X DELETE http://localhost:3000/api/conversations/1

# Verificar que fue borrada
curl http://localhost:3000/api/conversations
```

Expected: GET devuelve array JSON. DELETE devuelve `{"ok":true}`. Segunda llamada GET devuelve array sin el elemento borrado.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
cd /c/Users/spezi/Desktop/MegaBot
git add agente-delivery/src/app/api/conversations/
git commit -m "feat: conversations API — GET list + DELETE"
```

---

## Task 6: Messages + Mode API

**Files:**
- Create: `src/app/api/messages/[conversationId]/route.ts`
- Create: `src/app/api/mode/[conversationId]/route.ts`

- [ ] **Step 1: Create directories**

```bash
mkdir -p /c/Users/spezi/Desktop/MegaBot/agente-delivery/src/app/api/messages/\[conversationId\]
mkdir -p /c/Users/spezi/Desktop/MegaBot/agente-delivery/src/app/api/mode/\[conversationId\]
```

- [ ] **Step 2: Create `src/app/api/messages/[conversationId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConversationById, getMessages, insertMessage } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/ycloud";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = getMessages(id, 50);
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (convo.mode !== "HUMAN") {
    return NextResponse.json(
      { error: "Conversación no está en modo HUMAN" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const content: string = body?.content;
  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "content requerido" }, { status: 400 });
  }

  const message = insertMessage(id, "human", content.trim());

  try {
    await sendWhatsAppMessage(convo.phone, content.trim());
  } catch (err) {
    console.error("[messages] Error enviando a YCloud:", err);
    return NextResponse.json(
      { error: "Error enviando mensaje a WhatsApp" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, messageId: message.id });
}
```

- [ ] **Step 3: Create `src/app/api/mode/[conversationId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConversationById, setMode } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const mode = body?.mode;
  if (mode !== "AI" && mode !== "HUMAN") {
    return NextResponse.json(
      { error: "mode debe ser AI o HUMAN" },
      { status: 400 }
    );
  }

  setMode(id, mode);
  return NextResponse.json({ ok: true, mode });
}
```

- [ ] **Step 4: Test messages + mode API** (necesitás una conversación existente; enviar webhook primero si es necesario)

```bash
# Obtener lista de conversaciones para conseguir un id
curl http://localhost:3000/api/conversations

# GET mensajes de conversación id=1
curl http://localhost:3000/api/messages/1

# Cambiar a modo HUMAN
curl -X POST http://localhost:3000/api/mode/1 \
  -H "Content-Type: application/json" \
  -d '{"mode":"HUMAN"}'

# POST mensaje humano (YCloud fallará si no hay key real — eso es esperado)
curl -X POST http://localhost:3000/api/messages/1 \
  -H "Content-Type: application/json" \
  -d '{"content":"Hola, te atiendo en un momento!"}'

# Volver a AI
curl -X POST http://localhost:3000/api/mode/1 \
  -H "Content-Type: application/json" \
  -d '{"mode":"AI"}'
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/spezi/Desktop/MegaBot
git add agente-delivery/src/app/api/messages/ agente-delivery/src/app/api/mode/
git commit -m "feat: messages API (GET+POST) + mode toggle API"
```

---

## Task 7: React Components

**Files:**
- Create: `src/components/ModeToggle.tsx`
- Create: `src/components/MessageBubble.tsx`
- Create: `src/components/ConversationList.tsx`
- Create: `src/components/ConversationPanel.tsx`
- Create: `src/components/Dashboard.tsx`

- [ ] **Step 1: Create `src/components/ModeToggle.tsx`**

```tsx
"use client";

interface Props {
  mode: "AI" | "HUMAN";
  conversationId: number;
  onToggle: (id: number, mode: "AI" | "HUMAN") => void;
}

export default function ModeToggle({ mode, conversationId, onToggle }: Props) {
  const isAI = mode === "AI";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs" style={{ color: "#8b949e" }}>
        Modo:
      </span>
      <button
        onClick={() => onToggle(conversationId, isAI ? "HUMAN" : "AI")}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all"
        style={{
          background: isAI ? "#064e3b" : "#78350f",
          color: isAI ? "#10b981" : "#f59e0b",
          border: `2px solid ${isAI ? "#10b981" : "#f59e0b"}`,
          cursor: "pointer",
        }}
      >
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: isAI ? "#10b981" : "#f59e0b" }}
        />
        {isAI ? "IA — Automático" : "HUMANO — Manual"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/MessageBubble.tsx`**

```tsx
import type { Message } from "@/types";

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isHuman = message.role === "human";

  return (
    <div
      className={`flex mb-3 ${isUser ? "justify-start" : "justify-end"}`}
    >
      <div
        className="max-w-xs lg:max-w-md px-4 py-2 rounded-2xl"
        style={{
          background: isUser
            ? "#21262d"
            : isAssistant
            ? "#064e3b"
            : "#78350f",
          color: "#e6edf3",
        }}
      >
        {isHuman && (
          <div
            className="text-xs font-semibold mb-1"
            style={{ color: "#f59e0b" }}
          >
            Operador
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </p>
        <div
          className="text-xs mt-1 text-right"
          style={{ color: "#8b949e" }}
        >
          {formatTime(message.created_at)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/ConversationList.tsx`**

```tsx
"use client";
import type { ConversationWithPreview } from "@/types";

function relativeTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

interface Props {
  conversations: ConversationWithPreview[];
  activeId: number | null;
  onSelect: (id: number) => void;
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
}: Props) {
  if (conversations.length === 0) {
    return (
      <div className="p-4 text-sm" style={{ color: "#8b949e" }}>
        Sin conversaciones aún.
        <br />
        Esperando mensajes de WhatsApp.
      </div>
    );
  }

  return (
    <div>
      {conversations.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className="w-full text-left px-4 py-3 border-b transition-colors"
          style={{
            background: activeId === c.id ? "#1c2128" : "transparent",
            borderColor: "#30363d",
            cursor: "pointer",
          }}
        >
          <div className="flex items-center justify-between mb-1 gap-2">
            <span
              className="text-sm font-medium text-white truncate"
              style={{ maxWidth: "120px" }}
            >
              {c.name ?? c.phone}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
              style={{
                background: c.mode === "AI" ? "#064e3b" : "#78350f",
                color: c.mode === "AI" ? "#10b981" : "#f59e0b",
              }}
            >
              {c.mode === "AI" ? "IA" : "HUMANO"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-xs truncate"
              style={{ color: "#8b949e", maxWidth: "150px" }}
            >
              {c.last_message_preview
                ? c.last_message_preview.slice(0, 40)
                : "Sin mensajes"}
            </span>
            <span
              className="text-xs flex-shrink-0"
              style={{ color: "#8b949e" }}
            >
              {relativeTime(c.last_message_at)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/ConversationPanel.tsx`**

```tsx
"use client";
import { useState, useRef, useEffect } from "react";
import type { Conversation, Message } from "@/types";
import MessageBubble from "./MessageBubble";
import ModeToggle from "./ModeToggle";

interface Props {
  conversation: Conversation;
  messages: Message[];
  onToggleMode: (id: number, mode: "AI" | "HUMAN") => void;
  onSendMessage: (id: number, content: string) => Promise<boolean>;
  onDelete: (id: number) => void;
}

export default function ConversationPanel({
  conversation,
  messages,
  onToggleMode,
  onSendMessage,
  onDelete,
}: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const ok = await onSendMessage(conversation.id, input.trim());
    if (ok) setInput("");
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "#1c2128" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: "#30363d" }}
      >
        <div>
          <div className="font-semibold text-white">
            {conversation.name ?? conversation.phone}
          </div>
          <div
            className="text-xs font-mono"
            style={{ color: "#8b949e" }}
          >
            {conversation.phone}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle
            mode={conversation.mode}
            conversationId={conversation.id}
            onToggle={onToggleMode}
          />
          <button
            onClick={() => setShowConfirm(true)}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{
              color: "#f85149",
              border: "1px solid #f85149",
              cursor: "pointer",
            }}
          >
            Borrar
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {conversation.mode === "AI" && (
          <div
            className="text-center text-xs mb-3 py-2 rounded"
            style={{ background: "#0d2219", color: "#10b981" }}
          >
            El bot responde automáticamente
          </div>
        )}
        {messages.length === 0 && (
          <div
            className="text-center text-sm mt-8"
            style={{ color: "#8b949e" }}
          >
            Sin mensajes aún
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className="flex-shrink-0 px-4 py-3 border-t"
        style={{ borderColor: "#30363d" }}
      >
        {conversation.mode === "HUMAN" ? (
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribí tu respuesta... (Enter para enviar, Shift+Enter nueva línea)"
              rows={2}
              className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "#21262d",
                color: "#e6edf3",
                border: "1px solid #30363d",
              }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background:
                  sending || !input.trim() ? "#21262d" : "#10b981",
                color:
                  sending || !input.trim() ? "#8b949e" : "#000",
                cursor:
                  sending || !input.trim() ? "not-allowed" : "pointer",
              }}
            >
              {sending ? "..." : "Enviar"}
            </button>
          </div>
        ) : (
          <div
            className="text-center text-xs py-2"
            style={{ color: "#8b949e" }}
          >
            Cambiá a modo HUMANO para responder manualmente
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.75)" }}
        >
          <div
            className="rounded-xl p-6 w-80"
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
            }}
          >
            <h3 className="font-semibold text-white mb-2">
              ¿Borrar conversación?
            </h3>
            <p className="text-sm mb-4" style={{ color: "#8b949e" }}>
              Se eliminan todos los mensajes. Esta acción no se puede
              deshacer.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 rounded text-sm"
                style={{
                  background: "#21262d",
                  color: "#e6edf3",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  onDelete(conversation.id);
                }}
                className="px-3 py-1.5 rounded text-sm font-semibold"
                style={{
                  background: "#f85149",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `src/components/Dashboard.tsx`**

```tsx
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { ConversationWithPreview, Message } from "@/types";
import ConversationList from "./ConversationList";
import ConversationPanel from "./ConversationPanel";

export default function Dashboard() {
  const [conversations, setConversations] = useState<
    ConversationWithPreview[]
  >([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) setConversations(await res.json());
    } catch {
      // silent — polling retry en 3s
    }
  }, []);

  const fetchMessages = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/messages/${id}`);
      if (res.ok) setMessages(await res.json());
    } catch {
      // silent
    }
  }, []);

  const poll = useCallback(() => {
    if (document.hidden) return;
    fetchConversations();
    if (activeId !== null) fetchMessages(activeId);
  }, [activeId, fetchConversations, fetchMessages]);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  const handleSelectConversation = useCallback(
    (id: number) => {
      setActiveId(id);
      fetchMessages(id);
    },
    [fetchMessages]
  );

  const handleToggleMode = useCallback(
    async (id: number, mode: "AI" | "HUMAN") => {
      await fetch(`/api/mode/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      await fetchConversations();
    },
    [fetchConversations]
  );

  const handleSendMessage = useCallback(
    async (id: number, content: string): Promise<boolean> => {
      const res = await fetch(`/api/messages/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) await fetchMessages(id);
      return res.ok;
    },
    [fetchMessages]
  );

  const handleDeleteConversation = useCallback(
    async (id: number) => {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      await fetchConversations();
    },
    [activeId, fetchConversations]
  );

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="flex h-screen" style={{ background: "#0f1117" }}>
      {/* Top header */}
      <div
        className="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-10"
        style={{
          background: "#161b22",
          borderBottom: "1px solid #30363d",
        }}
      >
        <span className="font-semibold text-white text-sm">
          Mega Muebles & Sommiers — Dashboard WhatsApp
        </span>
        <span
          className="flex items-center gap-2 text-xs"
          style={{ color: "#10b981" }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: "#10b981" }}
          />
          Conectado
        </span>
      </div>

      {/* Body below header */}
      <div className="flex w-full pt-12">
        {/* Sidebar */}
        <div
          className="w-72 flex-shrink-0 overflow-y-auto"
          style={{
            background: "#161b22",
            borderRight: "1px solid #30363d",
          }}
        >
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelectConversation}
          />
        </div>

        {/* Main panel */}
        <div className="flex-1 overflow-hidden">
          {activeConversation ? (
            <ConversationPanel
              conversation={activeConversation}
              messages={messages}
              onToggleMode={handleToggleMode}
              onSendMessage={handleSendMessage}
              onDelete={handleDeleteConversation}
            />
          ) : (
            <div
              className="flex items-center justify-center h-full text-sm"
              style={{ color: "#8b949e" }}
            >
              Seleccioná una conversación para ver los mensajes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/spezi/Desktop/MegaBot
git add agente-delivery/src/components/
git commit -m "feat: componentes React — Dashboard, ConversationList, ConversationPanel, MessageBubble, ModeToggle"
```

---

## Task 8: App Shell + Visual Verification

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/page.tsx`

- [ ] **Step 1: Create `src/app/globals.css`**

```css
@import "tailwindcss";

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  height: 100%;
  overflow: hidden;
}

body {
  background-color: #0f1117;
  color: #e6edf3;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;
}

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #30363d;
  border-radius: 3px;
}
```

- [ ] **Step 2: Create `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mega Muebles & Sommiers — Dashboard WhatsApp",
  description: "Panel de operador para gestión de conversaciones de WhatsApp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create `src/app/page.tsx`**

```tsx
import Dashboard from "@/components/Dashboard";

export default function Home() {
  return <Dashboard />;
}
```

- [ ] **Step 4: Build check**

```bash
cd /c/Users/spezi/Desktop/MegaBot/agente-delivery
npm run build
```

Expected: build exitoso sin errores. Si hay errores de TypeScript, corregirlos antes de continuar.

- [ ] **Step 5: Start dev server and visual check**

```bash
npm run dev
```

Abrir `http://localhost:3000` en el browser. Verificar:

- [ ] Header con "Mega Muebles & Sommiers — Dashboard WhatsApp" y punto verde "Conectado"
- [ ] Sidebar izquierdo oscuro (#161b22) visible
- [ ] Mensaje "Sin conversaciones aún. Esperando mensajes de WhatsApp." si la DB está vacía
- [ ] Panel derecho con "Seleccioná una conversación..."
- [ ] Sin errores en la consola del browser (F12)

Enviar un mensaje de prueba al webhook para generar una conversación:

```bash
node -e "
const crypto = require('crypto');
const secret = process.env.YCLOUD_WEBHOOK_SECRET || 'test_secret_12345';
const body = JSON.stringify({
  type: 'whatsapp',
  payload: {
    id: 'msg_visual_test',
    from: '5492994001234',
    to: '5492990000000',
    type: 'text',
    text: { body: 'Buenas! Quiero ver sommiers dobles' },
    timestamp: Math.floor(Date.now()/1000),
    contact: { name: 'Carlos Rodríguez' }
  }
});
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
console.log(sig + '|' + body);
" | node -e "
const [sig, ...rest] = require('fs').readFileSync('/dev/stdin','utf8').trim().split('|');
const body = rest.join('|');
const http = require('http');
const req = http.request({hostname:'localhost',port:3000,path:'/api/webhook',method:'POST',headers:{'Content-Type':'application/json','X-YCloud-Signature':sig,'Content-Length':Buffer.byteLength(body)}});
req.write(body);
req.end();
req.on('response',r=>r.on('data',d=>console.log('Response:',d.toString())));
"
```

O más simple, usando curl con la firma pre-generada del Task 4.

Después de enviar, verificar en el browser (el polling tarda máx 3s):
- [ ] Conversación "Carlos Rodríguez" aparece en el sidebar
- [ ] Badge "IA" en verde
- [ ] Click en la conversación → mensajes visibles en el panel
- [ ] Toggle AI/HUMAN funciona (cambia badge y banner)
- [ ] Modal de confirmación al clickear "Borrar"

- [ ] **Step 6: Type-check final**

```bash
npx tsc --noEmit
```

Expected: cero errores.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/spezi/Desktop/MegaBot
git add agente-delivery/src/app/
git commit -m "feat: app shell + visual verification OK — layout, globals, page"
```

---

## Task 9: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
# Agente WhatsApp — Mega Muebles & Sommiers

Panel de operador + agente de IA para WhatsApp Business. Recibe mensajes vía [YCloud](https://ycloud.com), responde automáticamente con GPT-4o-mini, y permite al operador intervenir manualmente por chat.

## ⚠️ SEGURIDAD — LEER ANTES DE USAR EN PRODUCCIÓN

**El dashboard NO tiene autenticación.** Cualquiera con la URL puede leer todas las conversaciones de WhatsApp. Antes de usar en producción, elegí una opción:

- **Opción A (recomendada):** Cloudflare Access delante del dominio de Render
- **Opción B:** Middleware Next.js con basic auth en `src/middleware.ts`

## Setup local

### 1. Clonar y configurar variables de entorno

```bash
git clone <repo>
cd agente-delivery
cp .env.example .env.local
```

Editar `.env.local` con los valores reales:

| Variable | Cómo obtenerla |
|---|---|
| `YCLOUD_API_KEY` | [panel.ycloud.com](https://panel.ycloud.com) → Settings → API Keys |
| `YCLOUD_PHONE_NUMBER_ID` | YCloud panel → WhatsApp → Phone Numbers |
| `YCLOUD_WEBHOOK_SECRET` | Se genera al configurar el webhook en YCloud (ver abajo) |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) → API Keys |
| `OPENAI_MODEL` | Dejar `gpt-4o-mini` para v1 |

### 2. Instalar y correr

```bash
npm install   # ~1 min por compilación nativa de better-sqlite3
npm run dev   # http://localhost:3000
```

## Personalizar el agente

Editar `src/lib/system-prompt.ts` para agregar:

- **Catálogo de productos:** modelos de sommiers, colchones, muebles de dormitorio/living/comedor
- **Precios y financiación:** cuotas, tarjetas, efectivo
- **Horarios del local:** ejemplo "Lunes a Sábado 9 a 19hs, Domingo 10 a 14hs"
- **Zona de entrega:** barrios/localidades de Neuquén con costo de flete

## Configurar YCloud (webhook)

1. Iniciar sesión en [panel.ycloud.com](https://panel.ycloud.com)
2. Ir a **WhatsApp → Webhooks**
3. Agregar URL: `https://<tu-app>.onrender.com/api/webhook`
4. Crear un secreto (cualquier string aleatorio) → copiarlo en `YCLOUD_WEBHOOK_SECRET`
5. Activar el webhook y verificar que YCloud muestre estado "activo"

## Deploy en Render

1. Subir el código a un repo GitHub (privado)
2. En [render.com](https://render.com) → **New → Web Service**
3. Conectar el repo GitHub
4. Configurar:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm run start`
   - **Runtime:** Node 20
5. Agregar variables de entorno en el panel de Render (las mismas del `.env.example`)
6. **CRÍTICO — Disco persistente:** en la sección **Disks**, agregar disco montado en `/app/data` (mínimo 1 GB). Sin esto, cada redespliegue borra la DB con todas las conversaciones.
7. Una vez desplegado, copiar la URL pública y configurarla en YCloud como webhook URL

### Plan de Render

El plan gratuito suspende el servidor tras 15 minutos de inactividad. El primer mensaje del día puede tardar ~30 segundos mientras el servidor se despierta.

**Recomendado para producción:** Plan Starter ($7/mes) para keep-alive continuo.

### Rollback

Render guarda todos los deploys anteriores. En caso de problemas: **Dashboard → Deploys → seleccionar deploy anterior → Rollback**.

## Mejoras pendientes (v2)

- Autenticación del dashboard (basic auth o Cloudflare Access)
- Soporte de mensajes de imagen y audio de WhatsApp
- Notificaciones push cuando llega mensaje en modo HUMAN
- Exportar historial de conversaciones a CSV
- Multi-tenant: soporte para múltiples números de WhatsApp
````

- [ ] **Step 2: Final build**

```bash
cd /c/Users/spezi/Desktop/MegaBot/agente-delivery
npm run build
```

Expected: `✓ Compiled successfully` sin errores ni warnings relevantes.

- [ ] **Step 3: Commit README + tag**

```bash
cd /c/Users/spezi/Desktop/MegaBot
git add agente-delivery/README.md
git commit -m "docs: README — setup, YCloud config, Render deploy, security warning"
```

---

## Checklist Final para el Operador

Antes de ir a producción:

- [ ] Crear cuenta en YCloud y verificar número WhatsApp Business
- [ ] Obtener `YCLOUD_API_KEY` y `YCLOUD_PHONE_NUMBER_ID` del panel YCloud
- [ ] Subir código a GitHub (repo privado)
- [ ] Crear Web Service en Render desde el repo
- [ ] Agregar variables de entorno en Render
- [ ] Agregar Disk persistente montado en `/app/data`
- [ ] Copiar URL de Render y configurar en YCloud como webhook URL
- [ ] Generar `YCLOUD_WEBHOOK_SECRET` y configurarlo en YCloud y en Render
- [ ] Personalizar `src/lib/system-prompt.ts` con catálogo, precios y horarios reales
- [ ] Enviar mensaje de prueba al número de WhatsApp
- [ ] Verificar que aparece en el dashboard
- [ ] **ANTES DE PRODUCCIÓN: agregar autenticación al dashboard**
