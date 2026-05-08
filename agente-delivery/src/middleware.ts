import { NextResponse, type NextRequest } from 'next/server'

const KNOWN_TENANT_IDS = ['megamuebles', 'iguazufalls', 'impasto']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/menu')

  if (isPublic) return NextResponse.next()

  // Supabase SSR stores the session in a cookie named sb-<project-ref>-auth-token
  const hasSession = request.cookies.getAll().some(
    (c) => c.name.startsWith('sb-') && c.name.includes('auth-token')
  )

  if (!hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const tenantId = request.cookies.get('tenant-id')?.value
  if (!tenantId || !KNOWN_TENANT_IDS.includes(tenantId)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const res = NextResponse.redirect(url)
    res.cookies.delete('tenant-id')
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
