# WhatsApp Provider Abstraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor MegaBot para que WhatsApp sea una capa intercambiable (`WhatsAppProvider`), con Baileys como proveedor activo y YCloud/Meta como opciones futuras.

**Architecture:** Worker Node.js independiente (`src/worker/`) corre Baileys con WebSocket persistente y expone HTTP interno en `:3001` para status/QR/send. Next.js no cambia estructuralmente: se agrega `StatusWidget` en el header y `send-message.ts` enruta mensajes salientes al worker (Baileys) o directo a YCloud.

**Tech Stack:** Next.js 15, TypeScript, `@whiskeysockets/baileys`, `tsx`, `qrcode`, `concurrently`, `better-sqlite3`, OpenAI SDK

---

## File Map

| Archivo | Acción | Propósito |
|---|---|---|
| `src/providers/types.ts` | Crear | Interfaz `WhatsAppProvider`, `IncomingMessage`, `ProviderStatus` |
| `src/providers/ycloud.ts` | Crear | Adapter YCloud (envuelve `lib/ycloud.ts`) |
| `src/providers/meta.ts` | Crear | Stub Meta (lanza error) |
| `src/providers/factory.ts` | Crear | Instancia provider desde `WHATSAPP_PROVIDER` |
| `src/providers/baileys.ts` | Crear | Implementación completa de Baileys |
| `src/worker/tsconfig.json` | Crear | tsconfig para tsx (ESNext, sin Next.js plugins) |
| `src/worker/handle-incoming.ts` | Crear | Lógica AI/HUMAN extraída de `/api/webhook` |
| `src/worker/index.ts` | Crear | Entry del worker: arranca provider + HTTP :3001 |
| `src/lib/send-message.ts` | Crear | Enruta mensajes salientes según `WHATSAPP_PROVIDER` |
| `src/app/api/status/route.ts` | Crear | GET status (proxy al worker o estado directo YCloud) |
| `src/components/StatusWidget.tsx` | Crear | Estado de conexión + QR en el header del dashboard |
| `package.json` | Modificar | Nuevas deps + scripts |
| `.env.example` | Modificar | Nuevas variables de entorno |
| `.gitignore` | Modificar | Excluir `data/baileys-auth/` |
| `src/lib/db.ts` | Modificar | Import relativo de types + respetar `DATA_DIR` env |
| `src/app/api/webhook/route.ts` | Modificar | Early-return 200 si `WHATSAPP_PROVIDER=baileys` |
| `src/app/api/messages/[conversationId]/route.ts` | Modificar | Usar `send-message.ts` en vez de `ycloud.ts` directo |
| `src/components/Dashboard.tsx` | Modificar | Agregar `<StatusWidget />` en el header |

---

## Task 1: Instalar dependencias y actualizar configuración

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Instalar dependencias de producción y desarrollo**

Correr desde `agente-delivery/`:
```bash
npm install @whiskeysockets/baileys @hapi/boom qrcode
npm install --save-dev tsx concurrently @types/qrcode
```

Expected: sin errores. Verificar que `node_modules/@whiskeysockets/baileys` existe.

- [ ] **Step 2: Reemplazar el bloque `scripts` en `package.json`**

Bloque actual:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
}
```

Reemplazar con:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "dev:all": "concurrently -n next,worker -c cyan,green \"npm run dev\" \"npm run worker:dev\"",
  "worker:dev": "tsx watch src/worker/index.ts",
  "worker:build": "tsc --project src/worker/tsconfig.json --outDir dist/worker",
  "worker:start": "node dist/worker/index.js"
}
```

- [ ] **Step 3: Agregar variables al final de `.env.example`**

```
# ─── WhatsApp Provider ────────────────────────────────────────────────────────
# Opciones: baileys | ycloud | meta
WHATSAPP_PROVIDER=baileys

# URL interna del worker (sólo si WHATSAPP_PROVIDER=baileys)
WORKER_INTERNAL_URL=http://localhost:3001
WORKER_PORT=3001

# Directorio de datos persistentes (SQLite + sesión Baileys)
# En Render: DATA_DIR=/data
DATA_DIR=./data
```

- [ ] **Step 4: Actualizar `.gitignore`**

Verificar si existe un `.gitignore` en la raíz del repo (`MegaBot/`) o en `agente-delivery/`. Agregar al que corresponda (o a ambos). Si ninguno existe, crear `agente-delivery/.gitignore`:
```
# Baileys — contiene credenciales de sesión WhatsApp, nunca commitear
data/baileys-auth/

# Base de datos local
data/*.db
```

- [ ] **Step 5: Agregar también `data/baileys-auth/` al `.env.local` si tiene `DATA_DIR` seteado**

Verificar que `.env.local` tiene `OPENAI_API_KEY` ya configurada (el usuario confirmó esto). Agregar al final:
```
WHATSAPP_PROVIDER=baileys
WORKER_INTERNAL_URL=http://localhost:3001
WORKER_PORT=3001
DATA_DIR=./data
```

- [ ] **Step 6: Commit**
```bash
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: add baileys, qrcode, tsx, concurrently — deps + scripts + env"
```

---

## Task 2: Provider types

**Files:**
- Create: `src/providers/types.ts`

- [ ] **Step 1: Crear `src/providers/types.ts`**

```typescript
export type ProviderName = 'baileys' | 'ycloud' | 'meta';

export type ProviderStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'waiting_qr'
  | 'error';

export interface IncomingMessage {
  provider: ProviderName;
  externalMessageId: string;
  from: string;        // E.164 sin +: "5491112345678"
  to: string;          // número del bot
  text: string;
  timestamp: number;   // unix epoch segundos
  senderName?: string; // nombre del contacto si está disponible
  rawPayload: unknown;
}

export interface WhatsAppProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(to: string, text: string): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  getStatus(): ProviderStatus;
  getQrCode?(): string | null; // sólo Baileys lo implementa
}
```

- [ ] **Step 2: Commit**
```bash
git add src/providers/types.ts
git commit -m "feat: WhatsAppProvider interface + IncomingMessage types"
```

---

## Task 3: YCloud adapter

**Files:**
- Create: `src/providers/ycloud.ts`

- [ ] **Step 1: Crear `src/providers/ycloud.ts`**

```typescript
import { sendWhatsAppMessage } from '../lib/ycloud';
import type { WhatsAppProvider, IncomingMessage, ProviderStatus } from './types';

export class YCloudProvider implements WhatsAppProvider {
  private status: ProviderStatus = 'connected';
  private handler: ((msg: IncomingMessage) => Promise<void>) | null = null;

  async start(): Promise<void> {
    this.status = 'connected';
    console.log('[ycloud] Provider listo (webhook-based, siempre conectado)');
  }

  async stop(): Promise<void> {
    this.status = 'disconnected';
  }

  async sendMessage(to: string, text: string): Promise<void> {
    await sendWhatsAppMessage(to, text);
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.handler = handler;
  }

  async handleWebhookMessage(msg: IncomingMessage): Promise<void> {
    if (this.handler) await this.handler(msg);
  }

  getStatus(): ProviderStatus {
    return this.status;
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add src/providers/ycloud.ts
git commit -m "feat: YCloud provider adapter"
```

---

## Task 4: Meta stub

**Files:**
- Create: `src/providers/meta.ts`

- [ ] **Step 1: Crear `src/providers/meta.ts`**

```typescript
import type { WhatsAppProvider, IncomingMessage, ProviderStatus } from './types';

export class MetaProvider implements WhatsAppProvider {
  async start(): Promise<void> {
    throw new Error(
      'MetaProvider no implementado. ' +
      'Usá WHATSAPP_PROVIDER=ycloud para YCloud o WHATSAPP_PROVIDER=baileys para Baileys.'
    );
  }

  async stop(): Promise<void> {}

  async sendMessage(_to: string, _text: string): Promise<void> {
    throw new Error('MetaProvider no implementado.');
  }

  onMessage(_handler: (msg: IncomingMessage) => Promise<void>): void {}

  getStatus(): ProviderStatus {
    return 'disconnected';
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add src/providers/meta.ts
git commit -m "feat: Meta provider stub"
```

---

## Task 5: Provider factory

**Files:**
- Create: `src/providers/factory.ts`

- [ ] **Step 1: Crear `src/providers/factory.ts`**

```typescript
import type { WhatsAppProvider, ProviderName } from './types';

export function getProviderName(): ProviderName {
  const raw = process.env.WHATSAPP_PROVIDER ?? 'ycloud';
  if (raw !== 'baileys' && raw !== 'ycloud' && raw !== 'meta') {
    throw new Error(
      `WHATSAPP_PROVIDER inválido: "${raw}". Valores válidos: baileys | ycloud | meta`
    );
  }
  return raw;
}

export async function createProvider(name: ProviderName): Promise<WhatsAppProvider> {
  if (name === 'baileys') {
    const { BaileysProvider } = await import('./baileys');
    return new BaileysProvider();
  }
  if (name === 'ycloud') {
    const { YCloudProvider } = await import('./ycloud');
    return new YCloudProvider();
  }
  const { MetaProvider } = await import('./meta');
  return new MetaProvider();
}
```

- [ ] **Step 2: Commit**
```bash
git add src/providers/factory.ts
git commit -m "feat: provider factory — selecciona proveedor desde WHATSAPP_PROVIDER"
```

---

## Task 6: Actualizar db.ts

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Cambiar el import de types a ruta relativa (línea 4)**

Cambiar:
```typescript
import type { Conversation, ConversationWithPreview, Message } from "@/types";
```
Por:
```typescript
import type { Conversation, ConversationWithPreview, Message } from '../types';
```

Esto hace que `db.ts` sea importable tanto por Next.js como por el worker sin depender del alias `@/`.

- [ ] **Step 2: Reemplazar la definición de DATA_DIR (línea 6)**

Cambiar:
```typescript
const DATA_DIR = path.join(process.cwd(), "data");
```
Por:
```typescript
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');
```

- [ ] **Step 3: Verificar que Next.js sigue compilando**
```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 4: Commit**
```bash
git add src/lib/db.ts
git commit -m "fix: db.ts usa import relativo de types y respeta DATA_DIR env"
```

---

## Task 7: Baileys provider

**Files:**
- Create: `src/providers/baileys.ts`

- [ ] **Step 1: Crear `src/providers/baileys.ts`**

```typescript
import path from 'node:path';
import fs from 'node:fs/promises';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import type { WhatsAppProvider, IncomingMessage, ProviderStatus } from './types';

const PROVIDER: 'baileys' = 'baileys';

function jidToPhone(jid: string): string {
  return jid.split('@')[0];
}

function phoneToJid(phone: string): string {
  return phone.replace(/[^\d]/g, '') + '@s.whatsapp.net';
}

export class BaileysProvider implements WhatsAppProvider {
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private status: ProviderStatus = 'disconnected';
  private currentQr: string | null = null;
  private handler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private reconnectDelay = 1000;
  private stopped = false;
  private readonly authDir: string;

  constructor() {
    const dataDir = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(process.cwd(), 'data');
    this.authDir = path.join(dataDir, 'baileys-auth');
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.handler = handler;
  }

  getStatus(): ProviderStatus {
    return this.status;
  }

  getQrCode(): string | null {
    return this.currentQr;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.sock?.end(undefined);
    this.sock = null;
    this.status = 'disconnected';
    console.log('[baileys] Detenido.');
  }

  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.sock || this.status !== 'connected') {
      throw new Error(`[baileys] No se puede enviar: estado es "${this.status}"`);
    }
    await this.sock.sendMessage(phoneToJid(to), { text });
  }

  private async connect(): Promise<void> {
    await fs.mkdir(this.authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.status = 'connecting';
    console.log(`[baileys] Conectando con versión ${version.join('.')}...`);

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.currentQr = qr;
        this.status = 'waiting_qr';
        console.log('[baileys] QR generado — abrí el dashboard en http://localhost:3000 para escanearlo');
      }

      if (connection === 'open') {
        this.currentQr = null;
        this.status = 'connected';
        this.reconnectDelay = 1000;
        console.log('[baileys] ✓ Conectado a WhatsApp');
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = reason === DisconnectReason.loggedOut;

        if (loggedOut) {
          console.log('[baileys] Sesión cerrada (logout) — borrando credenciales y reiniciando QR...');
          await fs.rm(this.authDir, { recursive: true, force: true });
          this.reconnectDelay = 1000;
        } else {
          console.log(`[baileys] Conexión cerrada (código ${reason}) — reconectando en ${this.reconnectDelay}ms...`);
        }

        if (!this.stopped) {
          this.status = 'connecting';
          setTimeout(() => this.connect(), this.reconnectDelay);
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
        }
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe || !msg.message) continue;

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          '';
        if (!text.trim()) continue;

        const from = jidToPhone(msg.key.remoteJid ?? '');
        const to = jidToPhone(this.sock?.user?.id ?? '');
        const externalMessageId = msg.key.id ?? '';
        const timestamp =
          typeof msg.messageTimestamp === 'number'
            ? msg.messageTimestamp
            : Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1000));

        const normalized: IncomingMessage = {
          provider: PROVIDER,
          externalMessageId,
          from,
          to,
          text: text.trim(),
          timestamp,
          senderName: msg.pushName ?? undefined,
          rawPayload: msg,
        };

        if (this.handler) {
          await this.handler(normalized).catch((err) => {
            console.error('[baileys] Error procesando mensaje entrante:', err);
          });
        }
      }
    });
  }
}
```

- [ ] **Step 2: Verificar que TypeScript no tiene errores de tipos en los archivos de proveedores**
```bash
npx tsc --noEmit
```

Si hay errores de tipos en `baileys.ts` relacionados con Baileys internals (tipos de `makeWASocket`), son normales — Baileys no siempre exporta todos sus tipos. Con `skipLibCheck: true` en tsconfig no deberían afectar el build de Next.js.

- [ ] **Step 3: Commit**
```bash
git add src/providers/baileys.ts
git commit -m "feat: Baileys provider con QR, reconexión automática y manejo de mensajes"
```

---

## Task 8: Worker tsconfig

**Files:**
- Create: `src/worker/tsconfig.json`

- [ ] **Step 1: Crear `src/worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": [
    "./**/*",
    "../providers/**/*",
    "../lib/**/*",
    "../types.ts"
  ],
  "exclude": ["../../../node_modules"]
}
```

Nota: El worker usa `tsx` en runtime (no `tsc`), por eso `noEmit: true`. Los imports en worker y providers usan rutas relativas, no el alias `@/`.

- [ ] **Step 2: Commit**
```bash
git add src/worker/tsconfig.json
git commit -m "chore: tsconfig del worker para tsx"
```

---

## Task 9: handle-incoming.ts

**Files:**
- Create: `src/worker/handle-incoming.ts`

- [ ] **Step 1: Crear `src/worker/handle-incoming.ts`**

Extrae la lógica del webhook de YCloud actual (`src/app/api/webhook/route.ts`) en una función reutilizable que recibe un mensaje normalizado.

```typescript
import {
  getOrCreateConversation,
  getConversationById,
  insertMessage,
  getRecentHistory,
} from '../lib/db';
import { getAIReply } from '../lib/openai';
import { SYSTEM_PROMPT } from '../lib/system-prompt';
import type { WhatsAppProvider, IncomingMessage } from '../providers/types';

export async function handleIncoming(
  msg: IncomingMessage,
  provider: WhatsAppProvider
): Promise<void> {
  console.log(
    `[handler] ← ${msg.provider} | de ${msg.from} (${msg.senderName ?? 'sin nombre'}): "${msg.text}"`
  );

  const convo = getOrCreateConversation(msg.from, msg.senderName);
  insertMessage(convo.id, 'user', msg.text);

  const fresh = getConversationById(convo.id);
  if (!fresh || fresh.mode !== 'AI') {
    console.log(`[handler] Conversación ${convo.id} en modo HUMAN — sin auto-respuesta`);
    return;
  }

  const history = getRecentHistory(convo.id, 20);
  const llmMessages = history.map((m) => ({
    role: (m.role === 'human' ? 'assistant' : m.role) as 'user' | 'assistant',
    content: m.content,
  }));

  console.log(`[handler] Llamando LLM con ${llmMessages.length} mensajes...`);
  const start = Date.now();
  const reply = await getAIReply(llmMessages, SYSTEM_PROMPT);
  console.log(`[handler] LLM respondió en ${Date.now() - start}ms`);

  insertMessage(convo.id, 'assistant', reply);
  await provider.sendMessage(msg.from, reply);
  console.log(`[handler] → Enviado a ${msg.from}`);
}
```

- [ ] **Step 2: Commit**
```bash
git add src/worker/handle-incoming.ts
git commit -m "feat: handle-incoming — lógica AI/HUMAN extraída del webhook"
```

---

## Task 10: Worker index (entry point + HTTP server)

**Files:**
- Create: `src/worker/index.ts`

- [ ] **Step 1: Crear `src/worker/index.ts`**

```typescript
import http from 'node:http';
import { createProvider, getProviderName } from '../providers/factory';
import { handleIncoming } from './handle-incoming';

const PORT = parseInt(process.env.WORKER_PORT ?? '3001', 10);

async function main() {
  const providerName = getProviderName();
  console.log(`[worker] Iniciando con proveedor: ${providerName}`);

  const provider = await createProvider(providerName);
  provider.onMessage((msg) => handleIncoming(msg, provider));

  await provider.start();

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && req.url === '/status') {
      const status = provider.getStatus();
      const qr = provider.getQrCode?.() ?? null;
      res.writeHead(200);
      res.end(JSON.stringify({ status, provider: providerName, qr }));
      return;
    }

    if (req.method === 'POST' && req.url === '/send') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { to, text } = JSON.parse(body) as { to: string; text: string };
          if (!to || !text) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'to y text son requeridos' }));
            return;
          }
          await provider.sendMessage(to, text);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          console.error('[worker] Error en POST /send:', err);
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[worker] HTTP interno escuchando en http://127.0.0.1:${PORT}`);
  });

  process.on('SIGINT', async () => {
    console.log('\n[worker] Deteniendo...');
    await provider.stop();
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await provider.stop();
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[worker] Error fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verificar que el worker arranca (prueba rápida)**
```bash
cd agente-delivery
npm run worker:dev
```

Expected: `[worker] Iniciando con proveedor: baileys` → `[baileys] Conectando...` → `[baileys] QR generado...` en la consola.

Si hay error de módulo no encontrado, verificar que `@whiskeysockets/baileys` esté en `node_modules`.

Detener con Ctrl+C.

- [ ] **Step 3: Commit**
```bash
git add src/worker/index.ts
git commit -m "feat: worker entry point con HTTP /status y /send"
```

---

## Task 11: send-message.ts

**Files:**
- Create: `src/lib/send-message.ts`

- [ ] **Step 1: Crear `src/lib/send-message.ts`**

Esta función es usada por los API routes de Next.js para enviar mensajes salientes.

```typescript
import { sendWhatsAppMessage } from './ycloud';

export async function sendMessage(to: string, text: string): Promise<void> {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'ycloud';

  if (provider === 'baileys') {
    const workerUrl = process.env.WORKER_INTERNAL_URL ?? 'http://localhost:3001';
    const res = await fetch(`${workerUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Worker /send falló (${res.status}): ${body}`);
    }
    return;
  }

  if (provider === 'ycloud') {
    await sendWhatsAppMessage(to, text);
    return;
  }

  throw new Error(`sendMessage: proveedor "${provider}" no implementado para envío directo`);
}
```

- [ ] **Step 2: Verificar compilación de Next.js**
```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**
```bash
git add src/lib/send-message.ts
git commit -m "feat: send-message — enruta envío según WHATSAPP_PROVIDER"
```

---

## Task 12: Actualizar webhook route

**Files:**
- Modify: `src/app/api/webhook/route.ts`

- [ ] **Step 1: Agregar guard de early-return al inicio de la función POST**

Agregar justo antes del bloque `try` (después de la verificación de firma), alrededor de la línea 46:

```typescript
  // Si el proveedor activo es Baileys, los mensajes llegan por el socket del worker.
  // El webhook de YCloud no se usa — retornar 200 para evitar retries.
  if (process.env.WHATSAPP_PROVIDER === 'baileys') {
    return NextResponse.json({ ok: true });
  }
```

El archivo modificado en la función POST queda así (mostrando el bloque completo para claridad):

```typescript
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

  // Si el proveedor activo es Baileys, los mensajes llegan por el socket del worker.
  if (process.env.WHATSAPP_PROVIDER === 'baileys') {
    return NextResponse.json({ ok: true });
  }

  try {
    // ... resto del código existente sin cambios ...
```

- [ ] **Step 2: Verificar compilación**
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add src/app/api/webhook/route.ts
git commit -m "fix: webhook hace early-return si WHATSAPP_PROVIDER=baileys"
```

---

## Task 13: Actualizar messages route

**Files:**
- Modify: `src/app/api/messages/[conversationId]/route.ts`

- [ ] **Step 1: Reemplazar el import de ycloud por send-message**

Cambiar:
```typescript
import { sendWhatsAppMessage } from "@/lib/ycloud";
```
Por:
```typescript
import { sendMessage } from "@/lib/send-message";
```

- [ ] **Step 2: Reemplazar la llamada en la función POST**

Cambiar (alrededor de línea 46):
```typescript
  try {
    await sendWhatsAppMessage(convo.phone, content.trim());
  } catch (err) {
    console.error("[messages] Error enviando a YCloud:", err);
    return NextResponse.json(
      { error: "Error enviando mensaje a WhatsApp" },
      { status: 502 }
    );
  }
```
Por:
```typescript
  try {
    await sendMessage(convo.phone, content.trim());
  } catch (err) {
    console.error("[messages] Error enviando mensaje:", err);
    return NextResponse.json(
      { error: "Error enviando mensaje a WhatsApp" },
      { status: 502 }
    );
  }
```

- [ ] **Step 3: Verificar compilación**
```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**
```bash
git add src/app/api/messages/[conversationId]/route.ts
git commit -m "feat: messages route usa send-message en vez de ycloud directo"
```

---

## Task 14: Status API route

**Files:**
- Create: `src/app/api/status/route.ts`

- [ ] **Step 1: Crear `src/app/api/status/route.ts`**

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'ycloud';

  if (provider !== 'baileys') {
    // YCloud y Meta son webhook-based: si están configurados, están "conectados"
    return NextResponse.json({ status: 'connected', provider });
  }

  const workerUrl = process.env.WORKER_INTERNAL_URL ?? 'http://localhost:3001';

  try {
    const res = await fetch(`${workerUrl}/status`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Worker respondió ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({
      status: 'disconnected',
      provider: 'baileys',
      error: 'Worker no disponible — ¿corrés npm run worker:dev?',
    });
  }
}
```

- [ ] **Step 2: Verificar compilación**
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Verificar manualmente (con el worker corriendo)**
```bash
# Terminal 1:
npm run worker:dev

# Terminal 2 (o curl):
curl http://localhost:3000/api/status
```
Expected: `{"status":"waiting_qr","provider":"baileys","qr":"..."}` (string larga del QR).

- [ ] **Step 4: Commit**
```bash
git add src/app/api/status/route.ts
git commit -m "feat: GET /api/status — proxy al worker o estado directo YCloud"
```

---

## Task 15: StatusWidget component

**Files:**
- Create: `src/components/StatusWidget.tsx`

- [ ] **Step 1: Crear `src/components/StatusWidget.tsx`**

```typescript
'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface StatusData {
  status: 'connecting' | 'connected' | 'disconnected' | 'waiting_qr' | 'error';
  provider: string;
  qr?: string | null;
  error?: string;
}

const STATUS_CONFIG = {
  connected:     { color: '#10b981', label: 'Conectado' },
  connecting:    { color: '#f59e0b', label: 'Conectando…' },
  waiting_qr:    { color: '#3b82f6', label: 'Esperando QR' },
  disconnected:  { color: '#ef4444', label: 'Desconectado' },
  error:         { color: '#ef4444', label: 'Error' },
} as const;

export default function StatusWidget() {
  const [data, setData] = useState<StatusData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        if (res.ok && !cancelled) setData(await res.json());
      } catch {
        // silencioso — UI ya muestra "desconectado"
      }
    }

    poll();
    const id = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (data?.qr) {
      QRCode.toDataURL(data.qr, { width: 220, margin: 2 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    } else {
      setQrDataUrl(null);
      setShowQr(false);
    }
  }, [data?.qr]);

  if (!data) return null;

  const cfg = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.disconnected;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => data.status === 'waiting_qr' && setShowQr((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: data.status === 'waiting_qr' ? 'pointer' : 'default',
          padding: 0,
        }}
        title={data.status === 'waiting_qr' ? 'Click para ver el QR' : undefined}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: cfg.color,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span style={{ color: cfg.color, fontSize: 12, whiteSpace: 'nowrap' }}>
          {cfg.label}
          {data.provider && ` · ${data.provider}`}
          {data.status === 'waiting_qr' && ' (click para QR)'}
        </span>
      </button>

      {showQr && qrDataUrl && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 8,
            padding: 12,
            zIndex: 50,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <p style={{ color: '#8b949e', fontSize: 11, marginBottom: 8, textAlign: 'center' }}>
            Escaneá con WhatsApp → Dispositivos vinculados
          </p>
          <img src={qrDataUrl} alt="QR WhatsApp" style={{ display: 'block', borderRadius: 4 }} />
          <p style={{ color: '#6e7681', fontSize: 10, marginTop: 6, textAlign: 'center' }}>
            El QR se actualiza cada ~20s
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/StatusWidget.tsx
git commit -m "feat: StatusWidget — estado de conexión + QR de Baileys en el dashboard"
```

---

## Task 16: Actualizar Dashboard.tsx

**Files:**
- Modify: `src/components/Dashboard.tsx`

- [ ] **Step 1: Agregar el import de StatusWidget (línea 5, después de los imports existentes)**

```typescript
import StatusWidget from './StatusWidget';
```

- [ ] **Step 2: Reemplazar el indicador de estado estático en el header**

Buscar en el JSX el `<span>` con el punto verde estático (alrededor de línea 122):
```typescript
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
```

Reemplazar con:
```typescript
        <StatusWidget />
```

- [ ] **Step 3: Verificar compilación**
```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**
```bash
git add src/components/Dashboard.tsx
git commit -m "feat: Dashboard muestra StatusWidget en lugar del indicador estático"
```

---

## Task 17: Prueba end-to-end local

- [ ] **Step 1: Completar `.env.local` con las variables necesarias**

Verificar que `.env.local` tiene:
```
OPENAI_API_KEY=sk-...        # ya configurado
WHATSAPP_PROVIDER=baileys
WORKER_INTERNAL_URL=http://localhost:3001
WORKER_PORT=3001
DATA_DIR=./data
```

- [ ] **Step 2: Arrancar ambos procesos**
```bash
npm run dev:all
```

Expected en consola:
```
[worker] Iniciando con proveedor: baileys
[baileys] Conectando con versión X.X.X...
[baileys] QR generado — abrí el dashboard en http://localhost:3000 para escanearlo
```

Y Next.js en paralelo en `http://localhost:3000`.

- [ ] **Step 3: Escanear el QR**

1. Abrir `http://localhost:3000`
2. En el header, ver el indicador azul "Esperando QR · baileys (click para QR)"
3. Hacer click → aparece el QR
4. En WhatsApp mobile → Configuración → Dispositivos vinculados → Vincular dispositivo
5. Escanear el QR
6. En la consola del worker: `[baileys] ✓ Conectado a WhatsApp`
7. En el dashboard: indicador verde "Conectado · baileys"

- [ ] **Step 4: Enviar un mensaje de prueba al número vinculado**

Mandar un mensaje de texto desde cualquier WhatsApp al número vinculado.

Expected en consola del worker:
```
[handler] ← baileys | de 549XXXXXXXXX (Tu Nombre): "hola"
[handler] Llamando LLM con N mensajes...
[handler] LLM respondió en XXXms
[handler] → Enviado a 549XXXXXXXXX
```

La conversación debe aparecer en `http://localhost:3000`.

- [ ] **Step 5: Probar envío manual desde dashboard**

1. Seleccionar la conversación en el dashboard
2. Cambiar a modo HUMAN
3. Escribir un mensaje y enviarlo
4. Verificar que llega al WhatsApp

- [ ] **Step 6: Commit final**
```bash
git add .
git commit -m "feat: integración completa Baileys — QR, mensajes entrantes y salientes via worker"
```

---

## Cómo migrar de vuelta a YCloud (sin reescribir nada)

1. Cambiar en `.env.local`:
   ```
   WHATSAPP_PROVIDER=ycloud
   YCLOUD_API_KEY=...
   YCLOUD_PHONE_NUMBER_ID=...
   YCLOUD_WEBHOOK_SECRET=...
   ```
2. Correr solo `npm run dev` (sin el worker)
3. Configurar el webhook en el panel de YCloud apuntando a `https://tu-dominio/api/webhook`
4. Listo. El dashboard, AI, base de datos y modo AI/HUMAN funcionan idéntico

---

## Notas de seguridad

⚠️ **Baileys no es la API oficial de WhatsApp Business.** Es una librería de ingeniería inversa. Usarla en números con alto volumen o patrones que activen los filtros de spam de Meta puede resultar en baneo del número. Usar exclusivamente en un número de prueba hasta obtener acceso a la API oficial.

- `data/baileys-auth/` está en `.gitignore` — nunca commitear credenciales de sesión
- El HTTP del worker (`:3001`) escucha en `127.0.0.1` — no está expuesto públicamente
- El QR expira en ~20 segundos — el dashboard lo actualiza automáticamente
