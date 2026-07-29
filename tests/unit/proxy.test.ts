import { describe, it, expect, vi } from 'vitest'

// `src/proxy.ts` imports `@/auth`, whose next-auth chain resolves its own nested
// copy of `next/server` and fails under vitest. Only `config` is under test, so
// the auth wrapper is stubbed to a pass-through. The predecessor of this file
// dodged the problem by declaring its own regex literals inline and asserting
// against those — it imported nothing from the app and could not fail.
vi.mock('@/auth', () => ({ auth: (handler: unknown) => handler }))

const { config } = await import('@/proxy')

/**
 * Public paths must never reach the auth proxy. Before the AdSense compliance
 * wave the matcher was a negative-lookahead catch-all, so every path that was
 * not a static asset — `/robots.txt`, `/ads.txt`, and every unknown path —
 * was redirected to `/login` with HTTP 200. That is an infinite soft-404
 * surface, and AdSense cannot verify an `ads.txt` it can never fetch.
 */
const PUBLIC_PATHS = [
  '/robots.txt',
  '/sitemap.xml',
  '/ads.txt',
  '/privacy',
  '/terms',
  '/login',
  '/definitely-not-a-real-page',
]

const PROTECTED_PATHS = [
  '/',
  '/activities',
  '/calendar',
  '/calendar/anything',
  '/chat/abc123',
  '/feed',
  '/reflections',
  '/settings',
  '/tokens',
  '/u/someone',
  '/upgrade',
  '/api/calendar/events',
]

function matches(pathname: string): boolean {
  return config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname))
}

describe('proxy matcher', () => {
  it.each(PUBLIC_PATHS)('lets %s through without auth interception', (pathname) => {
    expect(matches(pathname)).toBe(false)
  })

  it.each(PROTECTED_PATHS)('still intercepts %s', (pathname) => {
    expect(matches(pathname)).toBe(true)
  })

  it('never matches static asset paths', () => {
    expect(matches('/_next/static/chunk.js')).toBe(false)
    expect(matches('/favicon.ico')).toBe(false)
    expect(matches('/og.png')).toBe(false)
  })
})
