# Multi-Tenant Bot Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar el dashboard de single-tenant a multi-tenant: un solo Next.js en :3000 sirve tres bots (Sofía / Paula / Chris) con colores, datos y workers completamente aislados por tenant.

**Architecture:** Config estático en `tenants.config.ts` mapea emails a tenant. `layout.tsx` inyecta CSS variables según sesión. Cada API route resuelve el tenant del usuario logueado y abre la SQLite del directorio correspondiente con `getDb(tenant.dataDir)`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase Auth, better-sqlite3, PM2, CSS custom properties.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/tenants.config.ts` | **Crear** | Fuente de verdad: TENANTS[], tipos, helpers puros getTenantByEmail/getTenantById |
| `src/lib/tenant.ts` | **Crear** | getSessionTenant() — wrapper async con Supabase (Next.js only) |
| `src/lib/db.ts` | **Modificar** | Cambiar de singleton global a getDb(dataDir) con cache. Mantiene backward-compat exports para el worker. |
| `src/lib/system-prompt.ts` | **Modificar** | Exportar buildSystemPrompt(botName, companyName) además del const existente |
| `src/lib/send-message.ts` | **Modificar** | Aceptar workerUrl opcional en vez de leer solo del env |
| `src/worker/handle-incoming.ts` | **Modificar** | Leer TENANT_ID del env, usar buildSystemPrompt con botName del tenant |
| `src/app/login/actions.ts` | **Modificar** | Después de auth exitoso: validar tenant, setear cookie tenant-id |
| `src/middleware.ts` | **Modificar** | Validar que tenant-id cookie corresponda a un tenant conocido |
| `src/app/layout.tsx` | **Modificar** | Async: leer sesión, inyectar CSS variables del tema en `<html>` |
| `src/app/page.tsx` | **Modificar** | Server Component: resolver tenant, pasar props a Dashboard |
| `src/app/login/page.tsx` | **Modificar** | Neutralizar branding (sin referencias a Mega Muebles) |
| `src/app/api/conversations/route.ts` | **Modificar** | Usar getSessionTenant + getDb |
| `src/app/api/conversations/[conversationId]/route.ts` | **Modificar** | Usar getSessionTenant + getDb |
| `src/app/api/messages/[conversationId]/route.ts` | **Modificar** | Usar getSessionTenant + getDb + tenant.workerUrl |
| `src/app/api/mode/[conversationId]/route.ts` | **Modificar** | Usar getSessionTenant + getDb |
| `src/app/api/status/route.ts` | **Modificar** | Usar tenant.workerUrl |
| `src/components/Dashboard.tsx` | **Modificar** | Aceptar tenantName/botName/tenantId como props; colores → CSS vars |
| `src/components/ConversationList.tsx` | **Modificar** | Colores hardcodeados → CSS vars |
| `src/components/ConversationPanel.tsx` | **Modificar** | Colores hardcodeados → CSS vars |
| `src/components/StatusWidget.tsx` | **Modificar** | Colores hardcodeados → CSS vars |
| `src/components/ModeToggle.tsx` | **Modificar** | Colores hardcodeados → CSS vars |
| `src/components/MessageBubble.tsx` | **Modificar** | Colores hardcodeados → CSS vars |
| `ecosystem.config.js` | **Crear** | Configuración PM2: next + 3 workers |

---

## Task 1: Crear `tenants.config.ts` — fuente de verdad

**Files:**
- Create: `agente-delivery/src/tenants.config.ts`

- [ ] **Step 1: Crear el archivo**

```ts
// agente-delivery/src/tenants.config.ts
import path from 'node:path'

export interface TenantTheme {
  primary: string
  accent: string
  bg: string
  surface: string
  border: string
  textMuted: string
  glow: string
}

export interface Tenant {
  id: string
  email: string
  name: string
  botName: string
  workerUrl: string
  dataDir: string
  theme: TenantTheme
}

export const TENANTS: Tenant[] = [
  {
    id: 'megamuebles',
    email: 'megamuebles.lafalda@gmail.com',
    name: 'Mega Muebles & Sommiers',
    botName: 'Sofía',
    workerUrl: 'http://localhost:3001',
    dataDir: path.resolve('./data/megamuebles'),
    theme: {
      primary:   '#22d986',
      accent:    '#0fa860',
      bg:        '#060a0f',
      surface:   '#0d1219',
      border:    '#1c2836',
      textMuted: '#3d5268',
      glow:      'rgba(34,217,134,0.28)',
    },
  },
  {
    id: 'iguazufalls',
    email: 'juanynatyzapata@hotmail.com',
    name: 'IguazuFalls',
    botName: 'Paula',
    workerUrl: 'http://localhost:3002',
    dataDir: path.resolve('./data/iguazufalls'),
    theme: {
      primary:   '#c084fc',
      accent:    '#ec4899',
      bg:        '#08040f',
      surface:   '#110820',
      border:    '#2d1a47',
      textMuted: '#5a3a7a',
      glow:      'rgba(192,132,252,0.28)',
    },
  },
  {
    id: 'impasto',
    email: 'spezialichristian@gmail.com',
    name: 'Impasto',
    botName: 'Chris',
    workerUrl: 'http://localhost:3003',
    dataDir: path.resolve('./data/impasto'),
    theme: {
      primary:   '#60a5fa',
      accent:    '#2563eb',
      bg:        '#030a12',
      surface:   '#071220',
      border:    '#0f2a47',
      textMuted: '#1a3a5a',
      glow:      'rgba(96,165,250,0.28)',
    },
  },
]

export function getTenantByEmail(email: string): Tenant | null {
  return TENANTS.find(t => t.email.toLowerCase() === email.toLowerCase()) ?? null
}

export function getTenantById(id: string): Tenant | null {
  return TENANTS.find(t => t.id === id) ?? null
}
```

- [ ] **Step 2: Verificar compilación TypeScript**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sin errores en `tenants.config.ts`.

- [ ] **Step 3: Commit**

```bash
git add agente-delivery/src/tenants.config.ts
git commit -m "feat: tenants.config.ts — config estático de 3 tenants con tipos y helpers"
```

---

## Task 2: Crear `src/lib/tenant.ts` — helper async con Supabase

**Files:**
- Create: `agente-delivery/src/lib/tenant.ts`

- [ ] **Step 1: Crear el archivo**

```ts
// agente-delivery/src/lib/tenant.ts
import { createClient } from '@/lib/supabase/server'
import { getTenantByEmail } from '@/tenants.config'
import type { Tenant } from '@/tenants.config'

export type { Tenant }
export { getTenantByEmail, getTenantById } from '@/tenants.config'

export async function getSessionTenant(): Promise<Tenant | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  return getTenantByEmail(user.email)
}
```

- [ ] **Step 2: Verificar compilación**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add agente-delivery/src/lib/tenant.ts
git commit -m "feat: lib/tenant.ts — getSessionTenant() para API routes"
```

---

## Task 3: Refactorizar `src/lib/db.ts` — getDb(dataDir) con cache

**Files:**
- Modify: `agente-delivery/src/lib/db.ts`

Este es el cambio más delicado. El objetivo: reemplazar el singleton global por `getDb(dataDir)` con cache por directorio. Los exports de nivel módulo se mantienen apuntando al DATA_DIR del env (backward compat para el worker).

- [ ] **Step 1: Reemplazar todo el contenido de `src/lib/db.ts`**

```ts
// agente-delivery/src/lib/db.ts
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import type { Conversation, ConversationWithPreview, Message } from '../types'

export interface DbContext {
  getOrCreateConversation(phone: string, name?: string): Conversation
  getConversationById(id: number): Conversation | null
  getConversationByPhone(phone: string): Conversation | null
  insertMessage(conversationId: number, role: 'user'|'assistant'|'human', content: string, mediaUrl?: string|null): Message
  getMessages(conversationId: number, limit?: number): Message[]
  getRecentHistory(conversationId: number, limit?: number): Message[]
  setMode(conversationId: number, mode: 'AI'|'HUMAN'): void
  listConversations(): ConversationWithPreview[]
  deleteConversation(id: number): void
  clearMessages(conversationId: number): void
}

const dbCache = new Map<string, DbContext>()

export function getDb(dataDir: string): DbContext {
  const resolved = path.resolve(dataDir)
  if (dbCache.has(resolved)) return dbCache.get(resolved)!

  fs.mkdirSync(resolved, { recursive: true })
  const db = new Database(path.join(resolved, 'messages.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

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
      media_url        TEXT,
      created_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv
      ON messages(conversation_id, created_at);
  `)

  try { db.exec(`ALTER TABLE messages ADD COLUMN media_url TEXT;`) } catch { /* ya existe */ }

  const stmts = {
    upsertConversation: db.prepare(`
      INSERT INTO conversations (phone, name) VALUES (?, ?)
      ON CONFLICT(phone) DO UPDATE SET name = COALESCE(excluded.name, conversations.name)
      RETURNING *
    `),
    getConversationById:   db.prepare(`SELECT * FROM conversations WHERE id = ?`),
    setMode:               db.prepare(`UPDATE conversations SET mode = ? WHERE id = ?`),
    listConversations:     db.prepare(`
      SELECT c.*,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_preview,
        (SELECT role    FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_role
      FROM conversations c
      ORDER BY COALESCE(c.last_message_at, 0) DESC
    `),
    insertMessage:         db.prepare(`INSERT INTO messages (conversation_id, role, content, media_url) VALUES (?, ?, ?, ?) RETURNING *`),
    updateLastMessageAt:   db.prepare(`UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?`),
    getMessages:           db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`),
    getRecentHistoryDesc:  db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`),
    deleteMessages:        db.prepare(`DELETE FROM messages WHERE conversation_id = ?`),
    getConversationByPhone:db.prepare(`SELECT * FROM conversations WHERE phone = ? OR phone LIKE ? LIMIT 1`),
    deleteConversation:    db.prepare(`DELETE FROM conversations WHERE id = ?`),
  }

  const insertMessageTx = db.transaction(
    (conversationId: number, role: string, content: string, mediaUrl: string|null): Message => {
      const msg = stmts.insertMessage.get(conversationId, role, content, mediaUrl) as Message
      stmts.updateLastMessageAt.run(conversationId)
      return msg
    }
  )

  const deleteConversationTx = db.transaction((id: number) => {
    stmts.deleteMessages.run(id)
    stmts.deleteConversation.run(id)
  })

  const ctx: DbContext = {
    getOrCreateConversation(phone, name) {
      return stmts.upsertConversation.get(phone, name ?? null) as Conversation
    },
    getConversationById(id) {
      return (stmts.getConversationById.get(id) as Conversation) ?? null
    },
    getConversationByPhone(phone) {
      const digits = phone.replace(/\D/g, '')
      return (stmts.getConversationByPhone.get(digits, `${digits}@%`) as Conversation) ?? null
    },
    insertMessage(conversationId, role, content, mediaUrl = null) {
      return insertMessageTx(conversationId, role, content, mediaUrl)
    },
    getMessages(conversationId, limit = 50) {
      return stmts.getMessages.all(conversationId, limit) as Message[]
    },
    getRecentHistory(conversationId, limit = 20) {
      const rows = stmts.getRecentHistoryDesc.all(conversationId, limit) as Message[]
      return rows.reverse()
    },
    setMode(conversationId, mode) {
      stmts.setMode.run(mode, conversationId)
    },
    listConversations() {
      return stmts.listConversations.all() as ConversationWithPreview[]
    },
    deleteConversation(id) {
      deleteConversationTx(id)
    },
    clearMessages(conversationId) {
      stmts.deleteMessages.run(conversationId)
    },
  }

  dbCache.set(resolved, ctx)
  return ctx
}

// ──────────────────────────────────────────────────────────────────────
// Backward-compat exports para el worker (usa DATA_DIR del env)
// El worker importa estas funciones directamente sin llamar getDb().
// ──────────────────────────────────────────────────────────────────────
const _defaultDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data')

const _default = getDb(_defaultDir)

export const getOrCreateConversation = (...a: Parameters<DbContext['getOrCreateConversation']>) => _default.getOrCreateConversation(...a)
export const getConversationById     = (...a: Parameters<DbContext['getConversationById']>)     => _default.getConversationById(...a)
export const getConversationByPhone  = (...a: Parameters<DbContext['getConversationByPhone']>)  => _default.getConversationByPhone(...a)
export const insertMessage           = (...a: Parameters<DbContext['insertMessage']>)           => _default.insertMessage(...a)
export const getMessages             = (...a: Parameters<DbContext['getMessages']>)             => _default.getMessages(...a)
export const getRecentHistory        = (...a: Parameters<DbContext['getRecentHistory']>)        => _default.getRecentHistory(...a)
export const setMode                 = (...a: Parameters<DbContext['setMode']>)                 => _default.setMode(...a)
export const listConversations       = ()                                                        => _default.listConversations()
export const deleteConversation      = (...a: Parameters<DbContext['deleteConversation']>)      => _default.deleteConversation(...a)
export const clearMessages           = (...a: Parameters<DbContext['clearMessages']>)           => _default.clearMessages(...a)
```

- [ ] **Step 2: Verificar que el worker sigue compilando sin cambios**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1 | head -30
```
Esperado: sin errores. El worker (`handle-incoming.ts`) importa las funciones con nombre que siguen exportadas.

- [ ] **Step 3: Smoke test del worker (opcional, si el QR de Baileys está activo)**

```bash
cd agente-delivery && npm run worker:dev
```
Esperado: arranca sin errores, crea `data/` si no existe.

- [ ] **Step 4: Commit**

```bash
git add agente-delivery/src/lib/db.ts
git commit -m "refactor: lib/db.ts — getDb(dataDir) factory con cache, backward-compat exports para worker"
```

---

## Task 4: Actualizar `src/lib/system-prompt.ts`

**Files:**
- Modify: `agente-delivery/src/lib/system-prompt.ts`

- [ ] **Step 1: Agregar función `buildSystemPrompt` al final del archivo**

Abrir `src/lib/system-prompt.ts`. El archivo tiene una sola export `SYSTEM_PROMPT` (el prompt de Sofía para Mega Muebles). Agregar al final del archivo, después del punto y coma de cierre:

```ts
// Agrega después del cierre de SYSTEM_PROMPT:

export function buildSystemPrompt(botName: string, companyName: string): string {
  if (botName === 'Sofía' && companyName === 'Mega Muebles & Sommiers') {
    return SYSTEM_PROMPT
  }
  // Prompt genérico para otros tenants — personalizable por tenant en el futuro
  return `Sos ${botName}, asistente virtual de ${companyName}. Respondés en español rioplatense, en mensajes breves de 2 a 4 líneas. Sos amable, directo y comercial. Estás disponible las 24 horas.

Al inicio de cada conversación nueva, saludate: "¡Hola! Soy ${botName}, asistente de ${companyName} 😊 ¿En qué te puedo ayudar?"

## Tono
- NUNCA terminés un mensaje con una pregunta. Punto final siempre.
- Sé afirmativo y directo.
- Usá solo información real. Nunca inventes datos.

## Derivar al supervisor
Cuando el cliente quiera confirmar una compra, pagar, o tenga una queja: "Ahora te comunico con un asesor, ¡un momento!"`.trim()
}
```

- [ ] **Step 2: Verificar compilación**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add agente-delivery/src/lib/system-prompt.ts
git commit -m "feat: system-prompt.ts — buildSystemPrompt(botName, companyName) para multi-tenant"
```

---

## Task 5: Actualizar `src/lib/send-message.ts`

**Files:**
- Modify: `agente-delivery/src/lib/send-message.ts`

- [ ] **Step 1: Agregar parámetro opcional `workerUrl`**

Reemplazar el contenido completo:

```ts
// agente-delivery/src/lib/send-message.ts
import { sendWhatsAppMessage } from './ycloud'

export async function sendMessage(to: string, text: string, workerUrl?: string): Promise<void> {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'ycloud'

  if (provider === 'baileys') {
    const url = (
      workerUrl ?? process.env.WORKER_INTERNAL_URL ?? 'http://localhost:3001'
    ).replace(/\/+$/, '')
    const res = await fetch(`${url}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Worker /send falló (${res.status}): ${body}`)
    }
    return
  }

  if (provider === 'ycloud') {
    await sendWhatsAppMessage(to, text)
    return
  }

  throw new Error(`sendMessage: proveedor "${provider}" no implementado para envío directo`)
}
```

- [ ] **Step 2: Verificar compilación**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add agente-delivery/src/lib/send-message.ts
git commit -m "feat: send-message.ts — workerUrl como parámetro opcional"
```

---

## Task 6: Actualizar `src/worker/handle-incoming.ts`

**Files:**
- Modify: `agente-delivery/src/worker/handle-incoming.ts`

- [ ] **Step 1: Reemplazar imports y uso de SYSTEM_PROMPT**

Reemplazar las líneas 1-12 (imports):

```ts
import {
  getOrCreateConversation,
  getConversationById,
  getConversationByPhone,
  insertMessage,
  getRecentHistory,
  setMode,
  clearMessages,
} from '../lib/db'
import { getAIReply } from '../lib/openai'
import { buildSystemPrompt } from '../lib/system-prompt'
import { getTenantById, TENANTS } from '../tenants.config'
import { getCatalogContext } from '../lib/catalog'
import { getCompanyInfoContext } from '../lib/company-info'
import { randomDelayMs, sleep } from '../lib/delay'
import type { WhatsAppProvider, IncomingMessage } from '../providers/types'
```

- [ ] **Step 2: Agregar resolución del tenant después de los imports (antes de las constantes)**

Agregar estas líneas justo después de los imports y antes de `const AI_REPLY_DELAY_MIN_MS`:

```ts
const _tenantId = process.env.TENANT_ID ?? 'megamuebles'
const _tenant = getTenantById(_tenantId) ?? TENANTS[0]
const SYSTEM_PROMPT = buildSystemPrompt(_tenant.botName, _tenant.name)
```

- [ ] **Step 3: Verificar compilación**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sin errores. El worker ahora usa el system prompt del tenant según `TENANT_ID` del env.

- [ ] **Step 4: Commit**

```bash
git add agente-delivery/src/worker/handle-incoming.ts
git commit -m "feat: worker handle-incoming — TENANT_ID del env determina botName y system prompt"
```

---

## Task 7: Actualizar `src/app/login/actions.ts` — cookie tenant-id

**Files:**
- Modify: `agente-delivery/src/app/login/actions.ts`

- [ ] **Step 1: Reemplazar el contenido completo**

```ts
// agente-delivery/src/app/login/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { getTenantByEmail } from '@/tenants.config'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export interface LoginState {
  error: string | null
}

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user?.email) {
    return { error: 'Email o contraseña incorrectos' }
  }

  const tenant = getTenantByEmail(data.user.email)
  if (!tenant) {
    return { error: 'Tu cuenta no tiene acceso a este sistema' }
  }

  const cookieStore = await cookies()
  cookieStore.set('tenant-id', tenant.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 días
  })

  redirect('/')
}

export async function logout(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const cookieStore = await cookies()
  cookieStore.delete('tenant-id')
  redirect('/login')
}
```

- [ ] **Step 2: Verificar compilación**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add agente-delivery/src/app/login/actions.ts
git commit -m "feat: login/actions — set tenant-id cookie, bloquear emails sin tenant"
```

---

## Task 8: Actualizar `src/middleware.ts` — validar tenant cookie

**Files:**
- Modify: `agente-delivery/src/middleware.ts`

- [ ] **Step 1: Reemplazar el contenido completo**

```ts
// agente-delivery/src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server'
import { getTenantById } from '@/tenants.config'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth')

  if (isPublic) return NextResponse.next()

  // Verificar sesión Supabase
  const hasSession = request.cookies.getAll().some(
    (c) => c.name.startsWith('sb-') && c.name.includes('auth-token')
  )

  if (!hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Verificar que el tenant-id sea conocido
  const tenantId = request.cookies.get('tenant-id')?.value
  if (tenantId && !getTenantById(tenantId)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const response = NextResponse.redirect(url)
    response.cookies.delete('tenant-id')
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verificar compilación**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add agente-delivery/src/middleware.ts
git commit -m "feat: middleware — validar tenant-id cookie, limpiar cookie inválida"
```

---

## Task 9: Actualizar `src/app/layout.tsx` — CSS variables de tema

**Files:**
- Modify: `agente-delivery/src/app/layout.tsx`

- [ ] **Step 1: Reemplazar el contenido completo**

```tsx
// agente-delivery/src/app/layout.tsx
import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'
import { getTenantByEmail } from '@/tenants.config'
import type { TenantTheme } from '@/tenants.config'
import './globals.css'

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
  display: 'swap',
})

const NEUTRAL_THEME: TenantTheme = {
  primary:   '#64748b',
  accent:    '#475569',
  bg:        '#060a0f',
  surface:   '#0d1219',
  border:    '#1c2836',
  textMuted: '#3d5268',
  glow:      'rgba(100,116,139,0.20)',
}

export const metadata: Metadata = {
  title: 'Bot Dashboard',
  description: 'Panel de operador para gestión de conversaciones de WhatsApp',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let theme = NEUTRAL_THEME
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      theme = getTenantByEmail(user.email)?.theme ?? NEUTRAL_THEME
    }
  } catch {
    // En la login page el cliente Supabase puede no tener sesión — usar tema neutro
  }

  return (
    <html
      lang="es"
      className={`${sans.variable} ${mono.variable}`}
      style={{
        '--color-primary': theme.primary,
        '--color-accent':  theme.accent,
        '--color-bg':      theme.bg,
        '--color-surface': theme.surface,
        '--color-border':  theme.border,
        '--color-muted':   theme.textMuted,
        '--color-glow':    theme.glow,
      } as React.CSSProperties}
    >
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Verificar compilación**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add agente-delivery/src/app/layout.tsx
git commit -m "feat: layout.tsx — inyectar CSS variables de tema según tenant de la sesión"
```

---

## Task 10: Actualizar `src/app/page.tsx` — Server Component con props de tenant

**Files:**
- Modify: `agente-delivery/src/app/page.tsx`

- [ ] **Step 1: Reemplazar el contenido completo**

```tsx
// agente-delivery/src/app/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTenantByEmail } from '@/tenants.config'
import Dashboard from '@/components/Dashboard'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) redirect('/login')

  const tenant = getTenantByEmail(user.email)
  if (!tenant) redirect('/login')

  return (
    <Dashboard
      tenantName={tenant.name}
      botName={tenant.botName}
      tenantId={tenant.id}
    />
  )
}
```

- [ ] **Step 2: Actualizar `src/components/Dashboard.tsx` para aceptar las nuevas props**

En `Dashboard.tsx`, cambiar la firma del componente. Reemplazar la línea:
```tsx
export default function Dashboard() {
```
por:
```tsx
interface DashboardProps {
  tenantName: string
  botName: string
  tenantId: string
}

export default function Dashboard({ tenantName, botName }: DashboardProps) {
```

Luego, reemplazar las dos líneas hardcodeadas de branding (líneas ~163-165):
```tsx
// Buscar y reemplazar esto:
<div style={{ fontSize: 13, fontWeight: 700, color: "#e8f0f8", lineHeight: 1.25, letterSpacing: "-0.01em" }}>
  Mega Muebles
</div>
<div style={{ fontSize: 10.5, color: "#3d5268", lineHeight: 1.4, marginTop: 1 }}>
  {conversations.length > 0
    ? `${conversations.length} conversacion${conversations.length !== 1 ? "es" : ""}`
    : "Panel de WhatsApp"}
</div>
```
por:
```tsx
<div style={{ fontSize: 13, fontWeight: 700, color: "#e8f0f8", lineHeight: 1.25, letterSpacing: "-0.01em" }}>
  {tenantName}
</div>
<div style={{ fontSize: 10.5, color: "var(--color-muted)", lineHeight: 1.4, marginTop: 1 }}>
  {conversations.length > 0
    ? `${conversations.length} conversacion${conversations.length !== 1 ? "es" : ""}`
    : "Panel de WhatsApp"}
</div>
```

- [ ] **Step 3: Reemplazar los colores del logo en Dashboard.tsx**

Buscar el div del logo (líneas ~147-158) y reemplazar los valores hardcodeados:
```tsx
// Reemplazar:
background: "linear-gradient(140deg, #22d986 0%, #0fa860 100%)",
// ...
boxShadow: "0 3px 12px rgba(34,217,134,0.28)",
```
por:
```tsx
background: "linear-gradient(140deg, var(--color-primary) 0%, var(--color-accent) 100%)",
// ...
boxShadow: "0 3px 12px var(--color-glow)",
```

- [ ] **Step 4: Reemplazar los bordes hardcodeados en Dashboard.tsx**

Reemplazar todas las ocurrencias de `"1px solid #1c2836"` por `"1px solid var(--color-border)"` en `Dashboard.tsx`. Son ~3 ocurrencias (sidebar header border, logout border, statusbar border).

Reemplazar `background: "#090e14"` (statusbar) por `background: "var(--color-bg)"`.
Reemplazar `background: "#111a25"` (empty state icon) por `background: "var(--color-surface)"`.

- [ ] **Step 5: Verificar compilación**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add agente-delivery/src/app/page.tsx agente-delivery/src/components/Dashboard.tsx
git commit -m "feat: page.tsx Server Component + Dashboard acepta tenantName/botName props, CSS vars en logo"
```

---

## Task 11: Neutralizar `src/app/login/page.tsx`

**Files:**
- Modify: `agente-delivery/src/app/login/page.tsx`

- [ ] **Step 1: Reemplazar el contenido completo**

```tsx
// agente-delivery/src/app/login/page.tsx
'use client'
import { useActionState } from 'react'
import { login, type LoginState } from './actions'

const initialState: LoginState = { error: null }

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, initialState)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'var(--font-sans, -apple-system, sans-serif)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          padding: '32px 28px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Logo neutro */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: 'linear-gradient(140deg, var(--color-primary) 0%, var(--color-accent) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 14px var(--color-glow)',
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e8f0f8', lineHeight: 1.25 }}>
              Bot Dashboard
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.4, marginTop: 1 }}>
              Iniciá sesión para continuar
            </div>
          </div>
        </div>

        <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="email" style={{ fontSize: 12, fontWeight: 500, color: '#7a9bb5', letterSpacing: '0.02em' }}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#e8f0f8',
                fontSize: 14,
                outline: 'none',
                width: '100%',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="password" style={{ fontSize: 12, fontWeight: 500, color: '#7a9bb5', letterSpacing: '0.02em' }}>
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#e8f0f8',
                fontSize: 14,
                outline: 'none',
                width: '100%',
              }}
            />
          </div>

          {state.error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                color: '#ef4444',
              }}
            >
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            style={{
              marginTop: 4,
              background: pending
                ? 'var(--color-surface)'
                : 'linear-gradient(140deg, var(--color-primary) 0%, var(--color-accent) 100%)',
              border: 'none',
              borderRadius: 8,
              padding: '11px 16px',
              color: pending ? 'var(--color-muted)' : '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: pending ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s',
            }}
          >
            {pending ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar compilación**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add agente-delivery/src/app/login/page.tsx
git commit -m "feat: login/page.tsx — branding neutro con CSS vars, sin referencia a Mega Muebles"
```

---

## Task 12: Actualizar API routes — getSessionTenant + getDb

**Files:**
- Modify: `agente-delivery/src/app/api/conversations/route.ts`
- Modify: `agente-delivery/src/app/api/conversations/[conversationId]/route.ts`
- Modify: `agente-delivery/src/app/api/messages/[conversationId]/route.ts`
- Modify: `agente-delivery/src/app/api/mode/[conversationId]/route.ts`
- Modify: `agente-delivery/src/app/api/status/route.ts`

- [ ] **Step 1: Reemplazar `src/app/api/conversations/route.ts`**

```ts
// agente-delivery/src/app/api/conversations/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSessionTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tenant = await getSessionTenant()
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(getDb(tenant.dataDir).listConversations())
}
```

- [ ] **Step 2: Reemplazar `src/app/api/conversations/[conversationId]/route.ts`**

```ts
// agente-delivery/src/app/api/conversations/[conversationId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSessionTenant } from '@/lib/tenant'

interface Ctx {
  params: Promise<{ conversationId: string }>
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const tenant = await getSessionTenant()
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await params
  const id = parseInt(conversationId, 10)
  const db = getDb(tenant.dataDir)

  const convo = db.getConversationById(id)
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  db.deleteConversation(id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Reemplazar `src/app/api/messages/[conversationId]/route.ts`**

```ts
// agente-delivery/src/app/api/messages/[conversationId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSessionTenant } from '@/lib/tenant'
import { sendMessage } from '@/lib/send-message'

export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ conversationId: string }>
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const tenant = await getSessionTenant()
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await params
  const id = parseInt(conversationId, 10)
  const db = getDb(tenant.dataDir)

  const convo = db.getConversationById(id)
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(db.getMessages(id, 50))
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const tenant = await getSessionTenant()
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await params
  const id = parseInt(conversationId, 10)
  const db = getDb(tenant.dataDir)

  const convo = db.getConversationById(id)
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (convo.mode !== 'HUMAN') {
    return NextResponse.json({ error: 'Conversación no está en modo HUMAN' }, { status: 400 })
  }

  const body = await req.json()
  const content: string = body?.content
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'content requerido' }, { status: 400 })
  }

  const trimmed = content.trim()

  try {
    await sendMessage(convo.phone, trimmed, tenant.workerUrl)
  } catch (err) {
    console.error('[messages] Error enviando mensaje:', err)
    return NextResponse.json({ error: 'Error enviando mensaje a WhatsApp' }, { status: 502 })
  }

  const message = db.insertMessage(id, 'human', trimmed)
  return NextResponse.json({ ok: true, messageId: message.id })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const tenant = await getSessionTenant()
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await params
  const id = parseInt(conversationId, 10)
  const db = getDb(tenant.dataDir)

  const convo = db.getConversationById(id)
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  db.clearMessages(id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Reemplazar `src/app/api/mode/[conversationId]/route.ts`**

```ts
// agente-delivery/src/app/api/mode/[conversationId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSessionTenant } from '@/lib/tenant'

interface Ctx {
  params: Promise<{ conversationId: string }>
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const tenant = await getSessionTenant()
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await params
  const id = parseInt(conversationId, 10)
  const db = getDb(tenant.dataDir)

  const convo = db.getConversationById(id)
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const mode = body?.mode
  if (mode !== 'AI' && mode !== 'HUMAN') {
    return NextResponse.json({ error: 'mode debe ser AI o HUMAN' }, { status: 400 })
  }

  db.setMode(id, mode)
  return NextResponse.json({ ok: true, mode })
}
```

- [ ] **Step 5: Reemplazar `src/app/api/status/route.ts`**

```ts
// agente-delivery/src/app/api/status/route.ts
import { NextResponse } from 'next/server'
import { getSessionTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tenant = await getSessionTenant()
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const provider = process.env.WHATSAPP_PROVIDER ?? 'ycloud'

  if (provider !== 'baileys') {
    return NextResponse.json({ status: 'connected', provider })
  }

  try {
    const res = await fetch(`${tenant.workerUrl}/status`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Worker respondió ${res.status}`)
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({
      status: 'disconnected',
      provider: 'baileys',
      error: 'Worker no disponible',
    })
  }
}
```

- [ ] **Step 6: Verificar compilación de todo el proyecto**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1
```
Esperado: cero errores.

- [ ] **Step 7: Commit**

```bash
git add agente-delivery/src/app/api/
git commit -m "feat: api routes — getSessionTenant + getDb(tenant.dataDir) en todas las rutas"
```

---

## Task 13: Reemplazar colores hardcodeados en componentes restantes

**Files:**
- Modify: `agente-delivery/src/components/ConversationList.tsx`
- Modify: `agente-delivery/src/components/ConversationPanel.tsx`
- Modify: `agente-delivery/src/components/StatusWidget.tsx`
- Modify: `agente-delivery/src/components/ModeToggle.tsx`
- Modify: `agente-delivery/src/components/MessageBubble.tsx`

El patrón de reemplazo es siempre el mismo. En cada archivo:

| Color hardcodeado | CSS var |
|---|---|
| `#22d986` | `var(--color-primary)` |
| `#0fa860` | `var(--color-accent)` |
| `#0d3d26` | derivado de primary, usar `color-mix(in srgb, var(--color-primary) 20%, transparent)` o hex similar. Ver nota abajo. |
| `linear-gradient(140deg, #22d986 0%, #0fa860 100%)` | `linear-gradient(140deg, var(--color-primary) 0%, var(--color-accent) 100%)` |
| `rgba(34,217,134,...)` | `var(--color-glow)` |
| `#060a0f` | `var(--color-bg)` |
| `#0d1219` | `var(--color-surface)` |
| `#1c2836` | `var(--color-border)` |
| `#3d5268` | `var(--color-muted)` |

> **Nota sobre `#0d3d26`:** Este color es verde-oscuro (fondo de badge "modo AI"). Reemplazarlo con `color-mix(in srgb, var(--color-primary) 15%, var(--color-surface))`. Si el navegador objetivo no soporta `color-mix`, usar directamente `var(--color-surface)` como fallback — el badge seguirá siendo legible.

- [ ] **Step 1: Leer cada componente y aplicar los reemplazos en ConversationList.tsx**

```bash
cd agente-delivery && grep -n "#22d986\|#0fa860\|#0d3d26\|#060a0f\|#0d1219\|#1c2836\|#3d5268\|rgba(34,217" src/components/ConversationList.tsx
```
Para cada línea encontrada, aplicar el reemplazo según la tabla de arriba usando el Edit tool.

- [ ] **Step 2: Aplicar reemplazos en ConversationPanel.tsx**

```bash
cd agente-delivery && grep -n "#22d986\|#0fa860\|#0d3d26\|#060a0f\|#0d1219\|#1c2836\|#3d5268\|rgba(34,217" src/components/ConversationPanel.tsx
```
Aplicar reemplazos.

- [ ] **Step 3: Aplicar reemplazos en StatusWidget.tsx**

```bash
cd agente-delivery && grep -n "#22d986\|#0fa860\|#0d3d26\|#060a0f\|#0d1219\|#1c2836\|#3d5268\|rgba(34,217" src/components/StatusWidget.tsx
```
Aplicar reemplazos.

- [ ] **Step 4: Aplicar reemplazos en ModeToggle.tsx**

```bash
cd agente-delivery && grep -n "#22d986\|#0fa860\|#0d3d26\|#060a0f\|#0d1219\|#1c2836\|#3d5268\|rgba(34,217" src/components/ModeToggle.tsx
```
Aplicar reemplazos.

- [ ] **Step 5: Aplicar reemplazos en MessageBubble.tsx**

```bash
cd agente-delivery && grep -n "#22d986\|#0fa860\|#0d3d26\|#060a0f\|#0d1219\|#1c2836\|#3d5268\|rgba(34,217" src/components/MessageBubble.tsx
```
Aplicar reemplazos.

- [ ] **Step 6: Verificar que no quedan colores hardcodeados de la paleta verde**

```bash
cd agente-delivery && grep -rn "#22d986\|#0fa860\|#0d3d26\|rgba(34,217" src/components/ src/app/
```
Esperado: cero líneas (solo deben quedar los valores en `tenants.config.ts`).

- [ ] **Step 7: Verificar compilación**

```bash
cd agente-delivery && npx tsc --noEmit 2>&1
```

- [ ] **Step 8: Commit**

```bash
git add agente-delivery/src/components/
git commit -m "feat: componentes — colores hardcodeados reemplazados por CSS variables de tema"
```

---

## Task 14: Crear `ecosystem.config.js` para PM2

**Files:**
- Create: `agente-delivery/ecosystem.config.js`

- [ ] **Step 1: Crear el archivo**

```js
// agente-delivery/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'next',
      script: 'npm',
      args: 'run next:start',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'worker-megamuebles',
      script: './node_modules/.bin/tsx',
      args: 'src/worker/index.ts',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        TENANT_ID: 'megamuebles',
        WORKER_PORT: '3001',
        DATA_DIR: './data/megamuebles',
        WHATSAPP_PROVIDER: 'baileys',
        // OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, etc. — leer de .env.local
      },
    },
    {
      name: 'worker-iguazufalls',
      script: './node_modules/.bin/tsx',
      args: 'src/worker/index.ts',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        TENANT_ID: 'iguazufalls',
        WORKER_PORT: '3002',
        DATA_DIR: './data/iguazufalls',
        WHATSAPP_PROVIDER: 'baileys',
      },
    },
    {
      name: 'worker-impasto',
      script: './node_modules/.bin/tsx',
      args: 'src/worker/index.ts',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        TENANT_ID: 'impasto',
        WORKER_PORT: '3003',
        DATA_DIR: './data/impasto',
        WHATSAPP_PROVIDER: 'baileys',
      },
    },
  ],
}
```

> **Nota:** Las API keys sensibles (`OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, etc.) NO van en este archivo (está en git). Deben estar en `.env.local` en el VPS. PM2 carga automáticamente `.env.local` si existe en el mismo directorio, o bien usar `pm2 set pm2:env OPENAI_API_KEY=...` para inyectarlas.

- [ ] **Step 2: Commit**

```bash
git add agente-delivery/ecosystem.config.js
git commit -m "feat: ecosystem.config.js — PM2 con next + 3 workers (megamuebles/iguazufalls/impasto)"
```

---

## Task 15: Verificación end-to-end

- [ ] **Step 1: Build completo sin errores**

```bash
cd agente-delivery && npm run build 2>&1 | tail -20
```
Esperado: `✓ Compiled successfully`, cero errores TypeScript.

- [ ] **Step 2: Levantar Next.js en dev**

```bash
cd agente-delivery && npm run next:dev
```

- [ ] **Step 3: Verificar login neutro**

Abrir http://localhost:3000/login. Debe mostrar "Bot Dashboard" con fondo slate gris (no verde). El botón de submit debe ser gris.

- [ ] **Step 4: Login con megamuebles.lafalda@gmail.com**

Ingresar credenciales. Después del redirect a `/`, el dashboard debe mostrar:
- Header verde con "Mega Muebles & Sommiers"
- Bot: "Sofía"
- Bordes y acentos en `#22d986`

- [ ] **Step 5: Logout y login con juanynatyzapata@hotmail.com**

El dashboard debe mostrar:
- Header violeta con "IguazuFalls"
- Bordes y acentos en `#c084fc` / `#ec4899`

- [ ] **Step 6: Logout y login con spezialichristian@gmail.com**

El dashboard debe mostrar:
- Header azul con "Impasto"
- Bordes y acentos en `#60a5fa` / `#2563eb`

- [ ] **Step 7: Verificar aislamiento de datos**

Estando logueado como megamuebles, crear una conversación desde el worker de megamuebles. Luego loguearse como impasto — no debe ver las conversaciones de megamuebles.

- [ ] **Step 8: Commit final**

```bash
git add -A
git commit -m "feat: multi-tenant completo — theming, auth, data isolation, 3 workers"
```

---

## Checklist de deployment en VPS

Después de mergear a main y hacer pull en el VPS:

1. `npm run build` en `agente-delivery/`
2. Verificar que `.env.local` tiene `OPENAI_API_KEY` y Supabase vars
3. `pm2 start ecosystem.config.js`
4. `pm2 status` — verificar que los 4 procesos están `online`
5. Escanear QR de Baileys por tenant: `pm2 logs worker-megamuebles` (esperar el QR en consola)
6. Repetir paso 5 para `worker-iguazufalls` y `worker-impasto`
