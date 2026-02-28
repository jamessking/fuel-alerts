import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'

export async function middleware(req) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  const isDashboard = req.nextUrl.pathname.startsWith('/dashboard')
  const isLoginPage = req.nextUrl.pathname === '/dashboard/login'

  if (isDashboard && !isLoginPage && !session) {
    return NextResponse.redirect(new URL('/dashboard/login', req.url))
  }

  if (isLoginPage && session) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
}
