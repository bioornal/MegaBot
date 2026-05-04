# Login con Supabase Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proteger el dashboard MegaBot con login de email + contraseña usando Supabase Auth SSR, de modo que ninguna ruta (UI ni API) sea accesible sin sesión válida.

**Architecture:** Se usa `@supabase/ssr` con un middleware de Next.js que verifica la cookie de sesión antes de cada request. Los helpers `server.ts` y `client.ts` encapsulan la creación del cliente Supabase para server-side y browser respectivamente. El login usa un Server Action con `useActionState`, y el logout usa un Server Action invocado desde un `<form>` en el sidebar.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, `@supabase/ssr`, `@supabase/supabase-js`

---

## Archivos que se crean o modifican

| Acción | Ruta |
|--------|------|
| Crear | `agente-delivery/middleware.ts` |
| Crear | `agente-delivery/src/lib/supabase/server.ts` |
| Crear | `agente-delivery/src/lib/supabase/client.ts` |
| Crear | `agente-delivery/src/app/auth/callback/route.ts` |
| Crear | `agente-delivery/src/app/login/actions.ts` |
| Crear | `agente-delivery/src/app/login/page.tsx` |
| Modificar | `agente-delivery/src/components/Dashboard.tsx` |

---

## Configuración previa (hacer una sola vez antes de Task 1)

Antes de tocar código, el usuario operador debe existir en Supabase:

1. Ir a **Supabase Dashboard → Authentication → Users**
2. Click **Add user → Create new user**
3. Ingresar el email y contraseña del operador → **Create user**
4. Ir a **Authentication → URL Configuration**
5. Setear **Site URL**: `https://megabot-admin.cloud`
6. En **Redirect URLs** agregar: `https://megabot-admin.cloud/auth/callback`
7. También agregar para desarrollo local: `http://localhost:3000/auth/callback`

---

## Task 1: Instalar dependencias

**Files:**
- Modify: `agente-delivery/package.json`

- [ ] **Step 1: Instalar paquetes**

```bash
cd agente-delivery
npm install @supabase/supabase-js @supabase/ssr
```

Salida esperada: líneas con `added N packages` sin errores.

- [ ] **Step 2: Verificar que quedaron en package.json**

```bash
grep -E "@supabase" package.json
```

Salida esperada:
```
"@supabase/ssr": "^...",
"@supabase/supabase-js": "^...",
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @supabase/ssr and @supabase/supabase-js"
```

---

## Task 2: Helpers de Supabase

**Files:**
- Create: `agente-delivery/src/lib/supabase/server.ts`
- Create: `agente-delivery/src/lib/supabase/client.ts`

- [ ] **Step 1: Crear `src/lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

- [ ] **Step 2: Crear `src/lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Verificar que TypeScript no da errores**

```bash
cd agente-delivery
npx tsc --noEmit
```

Salida esperada: sin errores (o solo los que ya existían antes).

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/server.ts src/lib/supabase/client.ts
git commit -m "feat: Supabase SSR client helpers (server + browser)"
```

---

## Task 3: Middleware de autenticación

**Files:**
- Create: `agente-delivery/middleware.ts`

El middleware se ubica en la raíz de `agente-delivery/` (al lado de `next.config.js`), no dentro de `src/`.

- [ ] **Step 1: Crear `middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/callback')

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd agente-delivery
npx tsc --noEmit
```

Salida esperada: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: middleware protege todas las rutas con Supabase Auth SSR"
```

---

## Task 4: Auth callback route

**Files:**
- Create: `agente-delivery/src/app/auth/callback/route.ts`

Esta ruta es necesaria para completar el flujo PKCE de Supabase (intercambia el `code` por una sesión).

- [ ] **Step 1: Crear `src/app/auth/callback/route.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login`)
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd agente-delivery
npx tsc --noEmit
```

Salida esperada: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "feat: auth callback route para PKCE flow de Supabase"
```

---

## Task 5: Server Actions de login y logout

**Files:**
- Create: `agente-delivery/src/app/login/actions.ts`

- [ ] **Step 1: Crear `src/app/login/actions.ts`**

```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export interface LoginState {
  error: string | null
}

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    return { error: 'Email o contraseña incorrectos' }
  }

  redirect('/')
}

export async function logout(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd agente-delivery
npx tsc --noEmit
```

Salida esperada: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/app/login/actions.ts
git commit -m "feat: Server Actions login y logout con Supabase Auth"
```

---

## Task 6: Página de login

**Files:**
- Create: `agente-delivery/src/app/login/page.tsx`

La página usa el mismo tema visual del dashboard: fondo `#060a0f`, tarjeta `#0d1219`, bordes `#1c2836`, texto `#e8f0f8`, acento verde `#22d986`. Usa `useActionState` de React 19 para manejar el estado del form.

- [ ] **Step 1: Crear `src/app/login/page.tsx`**

```typescript
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
        background: '#060a0f',
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
          background: '#0d1219',
          border: '1px solid #1c2836',
          borderRadius: 16,
          padding: '32px 28px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: 'linear-gradient(140deg, #22d986 0%, #0fa860 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 14px rgba(34,217,134,0.28)',
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e8f0f8', lineHeight: 1.25 }}>
              MegaBot
            </div>
            <div style={{ fontSize: 11, color: '#3d5268', lineHeight: 1.4, marginTop: 1 }}>
              Mega Muebles & Sommiers
            </div>
          </div>
        </div>

        <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Email */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor="email"
              style={{ fontSize: 12, fontWeight: 500, color: '#7a9bb5', letterSpacing: '0.02em' }}
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              style={{
                background: '#111a25',
                border: '1px solid #1c2836',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#e8f0f8',
                fontSize: 14,
                outline: 'none',
                width: '100%',
              }}
            />
          </div>

          {/* Contraseña */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor="password"
              style={{ fontSize: 12, fontWeight: 500, color: '#7a9bb5', letterSpacing: '0.02em' }}
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              style={{
                background: '#111a25',
                border: '1px solid #1c2836',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#e8f0f8',
                fontSize: 14,
                outline: 'none',
                width: '100%',
              }}
            />
          </div>

          {/* Error */}
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

          {/* Submit */}
          <button
            type="submit"
            disabled={pending}
            style={{
              marginTop: 4,
              background: pending
                ? '#0d3d26'
                : 'linear-gradient(140deg, #22d986 0%, #0fa860 100%)',
              border: 'none',
              borderRadius: 8,
              padding: '11px 16px',
              color: pending ? '#3d5268' : '#fff',
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

- [ ] **Step 2: Verificar TypeScript**

```bash
cd agente-delivery
npx tsc --noEmit
```

Salida esperada: sin errores nuevos.

- [ ] **Step 3: Verificar que la página buildea**

```bash
cd agente-delivery
npm run build
```

Salida esperada: build exitoso, ruta `/login` aparece en el output.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: página de login con email + contraseña (Supabase Auth)"
```

---

## Task 7: Botón de logout en el sidebar

**Files:**
- Modify: `agente-delivery/src/components/Dashboard.tsx`

El botón se agrega al final del sidebar, debajo de `ConversationList`. La lista ya tiene `flex: 1` con `overflowY: auto`, así que el botón queda pegado al fondo naturalmente.

- [ ] **Step 1: Agregar import de logout al tope del archivo**

En `Dashboard.tsx`, agregar el import después del último import existente:

```typescript
import { logout } from '@/app/login/actions'
```

- [ ] **Step 2: Agregar el bloque de logout al final del sidebar**

En el JSX del sidebar, inmediatamente **después** del bloque `{/* List */}` (que termina en `</div>`) y **antes** del `</div>` de cierre del sidebar, agregar:

```tsx
          {/* Logout */}
          <div
            style={{
              padding: '12px 12px',
              borderTop: '1px solid #1c2836',
              flexShrink: 0,
            }}
          >
            <form action={logout}>
              <button
                type="submit"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  background: 'transparent',
                  border: '1px solid #1c2836',
                  borderRadius: 8,
                  color: '#3d5268',
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = '#7a9bb5'
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#263648'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = '#3d5268'
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#1c2836'
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Cerrar sesión
              </button>
            </form>
          </div>
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd agente-delivery
npx tsc --noEmit
```

Salida esperada: sin errores nuevos.

- [ ] **Step 4: Build final**

```bash
cd agente-delivery
npm run build
```

Salida esperada: build exitoso sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: botón de logout en sidebar del dashboard"
```

---

## Task 8: Smoke test local y deploy al VPS

- [ ] **Step 1: Correr en desarrollo**

```bash
cd agente-delivery
npm run dev
```

- [ ] **Step 2: Verificar protección de rutas**

Abrir `http://localhost:3000` en el browser **sin sesión activa**.
Resultado esperado: redirige automáticamente a `http://localhost:3000/login`.

- [ ] **Step 3: Verificar protección de API routes**

```bash
curl -i http://localhost:3000/api/conversations
```

Resultado esperado: `HTTP/1.1 307 Temporary Redirect` con `location: /login`.

- [ ] **Step 4: Verificar login con credenciales incorrectas**

En el form de login, ingresar cualquier email/contraseña inválida.
Resultado esperado: aparece "Email o contraseña incorrectos" bajo el form, no redirige.

- [ ] **Step 5: Verificar login con credenciales correctas**

Ingresar el email y contraseña del usuario creado en Supabase.
Resultado esperado: redirige a `/` y muestra el dashboard normal.

- [ ] **Step 6: Verificar persistencia de sesión**

Cerrar y reabrir el browser (o abrir una nueva pestaña).
Ir a `http://localhost:3000`.
Resultado esperado: muestra el dashboard directamente, sin pedir login.

- [ ] **Step 7: Verificar logout**

Hacer click en "Cerrar sesión" en el sidebar.
Resultado esperado: redirige a `/login`. Intentar ir a `/` → redirige a `/login` nuevamente.

- [ ] **Step 8: Push a GitHub y deploy al VPS**

```bash
git push origin main
```

En el VPS (via SSH):
```bash
cd /ruta/del/proyecto/agente-delivery
git pull origin main
npm install
npm run build
# Reiniciar el proceso (pm2, systemd, etc.)
pm2 restart megabot   # o el nombre que uses
```

- [ ] **Step 9: Verificar en producción**

Abrir `https://megabot-admin.cloud` sin sesión.
Resultado esperado: redirige a `https://megabot-admin.cloud/login`.
Hacer login con las credenciales correctas → accede al dashboard.
