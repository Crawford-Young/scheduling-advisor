import { test, expect } from '@playwright/test'

test.describe('Quick-schedule chat lane', () => {
  // The global auth proxy (src/proxy.ts) matches every non-excluded path,
  // including API routes, and redirects unauthenticated requests to /login
  // BEFORE the route handler ever runs — so an unauthenticated POST to
  // /api/chat never reaches the route's own 401 guard; it is intercepted the
  // same way a protected/removed page would be (see AGENTS.md: "a removed
  // route is indistinguishable from a protected one" — the same rule holds
  // here). We therefore assert the observable redirect-to-/login behavior,
  // not the route's internal 401 JSON body, which is unreachable via the
  // real HTTP stack for an unauthenticated request.
  test('quick-schedule chat lane redirects unauthenticated requests to /login', async ({
    request,
  }) => {
    const res = await request.post('/api/chat', {
      data: { messages: [{ role: 'user', content: 'dinner friday 7pm' }], mode: 'quick-schedule' },
    })
    expect(res.url()).toMatch(/\/login/)
  })
})
