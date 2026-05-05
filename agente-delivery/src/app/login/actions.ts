'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getTenantByEmail } from '@/tenants.config'

export interface LoginState {
  error: string | null
}

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: formData.get('password') as string,
  })

  if (error) {
    return { error: 'Email o contraseña incorrectos' }
  }

  const tenant = getTenantByEmail(email)
  if (!tenant) {
    await supabase.auth.signOut()
    return { error: 'Tu cuenta no tiene acceso a este sistema' }
  }

  const cookieStore = await cookies()
  cookieStore.set('tenant-id', tenant.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
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
