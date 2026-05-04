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
