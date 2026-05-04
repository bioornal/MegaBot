# MegaBot — Contexto del proyecto

## Qué es
Dashboard de operador para gestionar conversaciones de WhatsApp de **Mega Muebles & Sommiers** (tienda de muebles y colchones, Neuquén capital). El bot se llama **Sofía** y responde automáticamente usando Claude/GPT. Los operadores pueden tomar el control manualmente desde el dashboard web.

## Repositorio
- Repo: `C:\Users\spezi\Desktop\MegaBot`
- Branch de trabajo: `feat/agente-whatsapp`
- Rama principal: `main`
- El código vive en el subdirectorio `agente-delivery/`

## Tech stack
- **Frontend/API**: Next.js 15 (App Router), React, Tailwind CSS v4, TypeScript
- **Bot/Worker**: Node.js con `tsx` watch, proceso persistente separado
- **WhatsApp**: Baileys (principal) o YCloud/Meta (alternativa)
- **AI**: OpenAI API (`getAIReply` en `src/lib/openai.ts`)
- **DB**: SQLite via `better-sqlite3` (local, archivo `data/messages.db`)
- **Catálogo/Empresa**: Supabase REST API (tablas `products` e `info_empresa`)
- **Fuentes**: Plus Jakarta Sans + JetBrains Mono via `next/font/google`

## Cómo correr

```bash
cd agente-delivery

# Desarrollo (Next.js en :3000 + worker Baileys en :3001, en paralelo)
npm run dev

# Solo Next.js
npm run next:dev

# Solo worker Baileys
npm run worker:dev

# Build
npm run build
```

## Arquitectura

```
agente-delivery/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── conversations/       GET lista, DELETE conversación
│   │   │   ├── messages/[id]/       GET mensajes, POST enviar, DELETE resetear memoria
│   │   │   ├── mode/[id]/           POST cambiar modo AI/HUMAN
│   │   │   ├── status/              GET estado de conexión WhatsApp
│   │   │   └── webhook/             POST recibe mensajes de YCloud/Meta
│   │   └── page.tsx                 Renderiza Dashboard
│   ├── components/
│   │   ├── Dashboard.tsx            Layout principal, polling, callbacks
│   │   ├── ConversationList.tsx     Sidebar con avatares de iniciales
│   │   ├── ConversationPanel.tsx    Chat, ModeToggle, Reset memoria, Borrar
│   │   ├── MessageBubble.tsx        Burbujas usuario/bot/operador
│   │   ├── ModeToggle.tsx           Toggle AI ↔ HUMANO
│   │   └── StatusWidget.tsx         Estado de conexión + QR Baileys
│   ├── lib/
│   │   ├── db.ts                    SQLite: conversations + messages
│   │   ├── system-prompt.ts         Prompt de Sofía (EDITAR ACÁ para cambiar comportamiento del bot)
│   │   ├── catalog.ts               Fetch Supabase productos → contexto AI
│   │   ├── company-info.ts          Fetch Supabase info_empresa → contexto AI
│   │   ├── delay.ts                 randomDelayMs + sleep
│   │   ├── openai.ts                getAIReply(messages, systemPrompt)
│   │   ├── send-message.ts          Enruta envío según WHATSAPP_PROVIDER
│   │   └── ycloud.ts                SDK YCloud
│   ├── providers/
│   │   ├── types.ts                 WhatsAppProvider interface + IncomingMessage
│   │   ├── baileys.ts               Implementación Baileys (principal)
│   │   ├── ycloud.ts                Adapter YCloud
│   │   ├── meta.ts                  Stub Meta
│   │   └── factory.ts               createProvider(env)
│   └── worker/
│       ├── index.ts                 Entry point: HTTP :3001 (/status, /send)
│       └── handle-incoming.ts       Lógica AI/HUMAN: catálogo + empresa + delay + reply
└── data/                            SQLite + sesión Baileys (gitignored)
```

## Flujo de un mensaje entrante (Baileys)
1. `providers/baileys.ts` recibe el mensaje → llama `handleIncoming(msg, provider)`
2. `worker/handle-incoming.ts`:
   - Guarda mensaje en SQLite
   - Si modo HUMAN → no responde
   - Si modo AI → consulta Supabase (catálogo + empresa) → llama OpenAI → espera 5-10s → envía
3. El dashboard (polling cada 10s) muestra el mensaje nuevo

## El bot: Sofía
- **Nombre**: Sofía, asistente de Mega Muebles & Sommiers
- **Objetivo**: cerrar ventas, tomar datos (nombre, dirección, teléfono), derivar al supervisor
- **Flujo**: cliente escribe → Sofía manda al sitio web primero → cuando el cliente menciona un producto concreto → da info desde Supabase → toma datos → deriva a humano
- **Sitio web**: https://megamueblessommiers.online/
- **Tono**: afirmativo, nunca cierra con pregunta
- **Postventa**: deriva a humano INMEDIATAMENTE, sin intentar responder
- **Datos**: NUNCA inventa — solo usa bloques CATÁLOGO SUPABASE e INFO EMPRESA SUPABASE

## Variables de entorno necesarias (.env.local)
```
WHATSAPP_PROVIDER=baileys
OPENAI_API_KEY=...
WORKER_PORT=3001
WORKER_INTERNAL_URL=http://localhost:3001
DATA_DIR=./data

# Supabase (opcional — si no están, el bot funciona sin catálogo)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_PRODUCTS_TABLE=products
SUPABASE_PRODUCT_ID_COLUMN=id
SUPABASE_PRODUCT_NAME_COLUMN=name
SUPABASE_PRODUCT_DESCRIPTION_COLUMN=description
SUPABASE_PRODUCT_CATEGORY_COLUMN=category
SUPABASE_PRODUCT_PRICE_COLUMN=price
SUPABASE_PRODUCT_STOCK_COLUMN=stock
SUPABASE_PRODUCT_ACTIVE_COLUMN=
SUPABASE_COMPANY_INFO_TABLE=info_empresa
```

## Issues conocidos (del code review — pendientes de fix)
- **CRÍTICO**: `webhook/route.ts` bloquea la respuesta HTTP hasta 20s+ — YCloud puede reintentar y generar mensajes duplicados. Fix: procesar de forma async (fire-and-forget).
- **IMPORTANTE**: `catalog.ts` y `company-info.ts` no tienen timeout en el fetch a Supabase.
- **IMPORTANTE**: `.env.example` solo documenta vars `NEXT_PUBLIC_` — agregar `SUPABASE_URL` y `SUPABASE_ANON_KEY` sin prefijo para el worker.

## Features del dashboard
- Lista de conversaciones con avatares de iniciales (color único por contacto)
- Toggle AI ↔ HUMANO por conversación
- Envío manual de mensajes (modo HUMANO)
- **Resetear memoria IA**: borra historial, Sofía arranca de cero con ese cliente
- Borrar conversación completa
- StatusWidget: muestra estado de conexión Baileys + QR para vincular número
- Polling automático cada 10s
