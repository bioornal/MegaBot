# Login con Supabase Auth — Design Doc

**Fecha:** 2026-05-04
**Proyecto:** MegaBot (dashboard WhatsApp para Mega Muebles & Sommiers)
**Scope:** Agregar autenticación con email + contraseña usando Supabase Auth SSR a un dashboard Next.js 15 App Router ya en producción en https://megabot-admin.cloud/

---

## Contexto

El dashboard actualmente no tiene ningún tipo de autenticación — cualquiera con la URL puede ver y operar las conversaciones de WhatsApp. Hay un único operador (el dueño). Se requiere proteger el acceso con login email + contraseña usando Supabase Auth, el mismo proyecto Supabase que ya se usa para el catálogo de productos e info empresa.

---

## Requisitos

- Un solo usuario operador (sin página de registro)
- Email + contraseña como método de login
- Sesión persistente: no expira, solo cierra manualmente
- Protección de **todas** las rutas: tanto el dashboard como las API routes (`/api/*`)
- UI consistente con el tema oscuro actual del dashboard

---

## Enfoque elegido: Supabase Auth con SSR (`@supabase/ssr`)

Usa cookies HttpOnly gestionadas por `@supabase/ssr`. El middleware de Next.js verifica la sesión en el servidor antes de procesar cualquier request. Protege tanto el frontend como las API routes.

Descartadas:
- **Auth solo en cliente**: deja las API routes sin protección real
- **Basic Auth HTTP**: no usa Supabase Auth, sin gestión de sesión real

---

## Arquitectura

### Archivos nuevos

```
agente-delivery/
├── middleware.ts                        ← intercepta todas las rutas, verifica sesión
├── src/lib/supabase/
│   ├── server.ts                        ← createServerClient helper (Server Components / Actions)
│   └── client.ts                        ← createBrowserClient helper (logout en cliente)
├── src/app/login/
│   ├── page.tsx                         ← formulario email + contraseña
│   └── actions.ts                       ← Server Action: signInWithPassword
└── src/app/auth/callback/
    └── route.ts                         ← callback PKCE de Supabase (requerido por el flow)
```

### Archivos modificados

- `agente-delivery/src/components/Dashboard.tsx` — agrega botón "Cerrar sesión" en el sidebar

### Variables de entorno

No se requieren variables nuevas. Se reusan las ya existentes:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Dependencia nueva

```
@supabase/ssr
```

---

## Flujo de datos

```
Visita cualquier URL
        ↓
middleware.ts — verifica cookie de sesión via @supabase/ssr
        ↓
   ¿Hay sesión válida?
   ├─ NO  → redirect 307 a /login
   └─ SÍ  → deja pasar, refresca cookie si está por vencer
        ↓
/login — Server Action (actions.ts)
   supabase.auth.signInWithPassword({ email, password })
   ├─ Error → muestra "Email o contraseña incorrectos" en el form
   └─ OK   → @supabase/ssr escribe cookie HttpOnly → redirect a /
        ↓
Botón "Cerrar sesión" en Dashboard
   supabase.auth.signOut() → borra cookie → redirect a /login
```

### Rutas excluidas del middleware

- `/login`
- `/auth/callback`

Todas las demás rutas (incluyendo `/api/*`) quedan protegidas.

---

## UI

### Página `/login`

- Tarjeta centrada en pantalla, fondo oscuro igual al dashboard
- Fuente Plus Jakarta Sans (ya cargada en `layout.tsx`)
- Encabezado: nombre "MegaBot" o logo
- Campos: Email, Contraseña
- Botón "Iniciar sesión" — muestra "Iniciando sesión..." mientras procesa (evita doble click)
- Mensaje de error inline bajo el formulario si las credenciales son incorrectas
- Sin link de registro
- Sin "¿Olvidaste tu contraseña?" (el usuario se gestiona desde Supabase Dashboard)

### Botón de logout en Dashboard

- Ubicado en el sidebar, debajo del StatusWidget
- Estilo secundario/discreto: ícono + texto "Cerrar sesión"
- No prominente — no interfiere con el flujo normal de trabajo

---

## Gestión del usuario

El usuario operador se crea **manualmente** desde el Dashboard de Supabase (Authentication → Users → Invite user o Add user). No hay flujo de signup en la app.

---

## Lo que NO incluye este scope

- Página de registro
- Recuperación de contraseña (disponible desde Supabase Dashboard)
- Múltiples usuarios / roles
- Autenticación de API routes con bearer token (la cookie SSR es suficiente para el uso actual)

---

## Criterios de éxito

1. Acceder a `/` sin sesión redirige a `/login`
2. Acceder a `/api/conversations` sin sesión devuelve 307 redirect (no datos)
3. Login con credenciales correctas → accede al dashboard
4. Login con credenciales incorrectas → muestra error, no redirige
5. "Cerrar sesión" → redirige a `/login`, la cookie queda inválida
6. Refrescar el dashboard con sesión activa → no pide login
