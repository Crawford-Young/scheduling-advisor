import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAuthRoute = req.nextUrl.pathname.startsWith('/api/auth')
  // The matcher below no longer routes `/login` here, so this is a loop-breaker
  // rather than a live branch: it is what stops a logged-out visitor being
  // redirected from `/login` to `/login` if the matcher ever re-includes it.
  const isLoginPage = req.nextUrl.pathname === '/login'
  const isHealthCheck = req.nextUrl.pathname === '/api/health'
  const isStripeWebhook = req.nextUrl.pathname === '/api/stripe/webhook'
  if (isAuthRoute || isLoginPage || isHealthCheck || isStripeWebhook) return NextResponse.next()

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
})

/**
 * An ALLOW-LIST of protected surfaces, not a negative-lookahead catch-all.
 *
 * The previous matcher — `/((?!_next/static|_next/image|favicon.ico|.*\.png$).*)`
 * — swallowed every path it did not explicitly exclude, so `/robots.txt`,
 * `/ads.txt`, and every unknown path redirected to `/login` and returned HTTP
 * 200. That made the host one infinite soft-404 surface with no reachable
 * `ads.txt`. Anything not listed here now falls through to Next, which means
 * public files are served and unknown paths return a real 404.
 *
 * The segments are the contents of `src/app/(app)/` plus `/upgrade`; keep this
 * list and the `disallow` list in `src/app/robots.ts` describing the same set.
 * Written as literals because Next statically analyses this object at build
 * time — it cannot be assembled from a variable.
 */
export const config = {
  matcher: [
    '/',
    '/(activities|calendar|chat|feed|reflections|settings|tokens|u|upgrade)(/.*)?',
    '/api/(.*)',
  ],
}
