import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAuthRoute = req.nextUrl.pathname.startsWith('/api/auth')
  const isLoginPage = req.nextUrl.pathname === '/login'
  const isHealthCheck = req.nextUrl.pathname === '/api/health'
  const isStripeWebhook = req.nextUrl.pathname === '/api/stripe/webhook'
  if (isAuthRoute || isLoginPage || isHealthCheck || isStripeWebhook) return NextResponse.next()

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
