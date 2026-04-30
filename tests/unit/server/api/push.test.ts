import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockSubscribeToPush, mockUnsubscribeFromPush, mockRatelimit } = vi.hoisted(
  () => ({
    mockAuth: vi.fn(),
    mockSubscribeToPush: vi.fn(),
    mockUnsubscribeFromPush: vi.fn(),
    mockRatelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
  }),
)

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/server/actions/push-subscriptions', () => ({
  subscribeToPush: mockSubscribeToPush,
  unsubscribeFromPush: mockUnsubscribeFromPush,
}))
vi.mock('@/lib/redis', () => ({ ratelimit: mockRatelimit }))

const session = { user: { id: 'user-123' } }

async function importRoute() {
  return import('@/app/api/push/route')
}

describe('POST /api/push/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
    mockSubscribeToPush.mockResolvedValue({ data: { endpoint: 'https://push.example.com' } })
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const { POST } = await importRoute()
    const req = new NextRequest('http://localhost/api/push', {
      method: 'POST',
      body: JSON.stringify({
        action: 'subscribe',
        endpoint: 'https://push.example.com',
        p256dh: 'k',
        auth: 'a',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mockRatelimit.limit.mockResolvedValueOnce({ success: false })
    const { POST } = await importRoute()
    const req = new NextRequest('http://localhost/api/push', {
      method: 'POST',
      body: JSON.stringify({
        action: 'subscribe',
        endpoint: 'https://push.example.com',
        p256dh: 'k',
        auth: 'a',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(429)
  })

  it('calls subscribeToPush and returns 200 for subscribe action', async () => {
    const { POST } = await importRoute()
    const req = new NextRequest('http://localhost/api/push', {
      method: 'POST',
      body: JSON.stringify({
        action: 'subscribe',
        endpoint: 'https://push.example.com',
        p256dh: 'key',
        auth: 'auth',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockSubscribeToPush).toHaveBeenCalledWith({
      endpoint: 'https://push.example.com',
      p256dh: 'key',
      auth: 'auth',
    })
  })

  it('calls unsubscribeFromPush and returns 200 for unsubscribe action', async () => {
    mockUnsubscribeFromPush.mockResolvedValue({ data: { success: true } })
    const { POST } = await importRoute()
    const req = new NextRequest('http://localhost/api/push', {
      method: 'POST',
      body: JSON.stringify({ action: 'unsubscribe', endpoint: 'https://push.example.com' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockUnsubscribeFromPush).toHaveBeenCalledWith('https://push.example.com')
  })

  it('returns 400 for invalid body', async () => {
    const { POST } = await importRoute()
    const req = new NextRequest('http://localhost/api/push', {
      method: 'POST',
      body: JSON.stringify({ action: 'subscribe' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for unknown action', async () => {
    const { POST } = await importRoute()
    const req = new NextRequest('http://localhost/api/push', {
      method: 'POST',
      body: JSON.stringify({ action: 'bogus', endpoint: 'https://push.example.com' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 when subscribeToPush returns error', async () => {
    mockSubscribeToPush.mockResolvedValue({ error: 'DB error' })
    const { POST } = await importRoute()
    const req = new NextRequest('http://localhost/api/push', {
      method: 'POST',
      body: JSON.stringify({
        action: 'subscribe',
        endpoint: 'https://push.example.com',
        p256dh: 'k',
        auth: 'a',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
