import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockWhereSelect = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ stripeCustomerId: 'cus_123' }]),
)
const mockFromSelect = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereSelect }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockFromSelect }))

const mockPortalCreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/session/abc' }),
)

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))

vi.mock('@/db', () => ({
  db: { select: mockSelect },
}))

vi.mock('@/db/schema', () => ({ users: {} }))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    billingPortal: {
      sessions: { create: mockPortalCreate },
    },
  },
}))

vi.mock('@/env', () => ({
  env: { NEXT_PUBLIC_APP_URL: 'https://app.example.com' },
}))

import { POST } from '@/app/api/stripe/portal/route'

describe('POST /api/stripe/portal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns portal URL for authenticated user with subscription', async () => {
    const res = await POST()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ url: 'https://billing.stripe.com/session/abc' })
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://app.example.com/tokens',
    })
  })

  it('returns 401 when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 400 when user has no Stripe customer id', async () => {
    mockWhereSelect.mockResolvedValueOnce([{ stripeCustomerId: null }])
    const res = await POST()
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'No subscription found' })
  })

  it('returns 400 when user record not found', async () => {
    mockWhereSelect.mockResolvedValueOnce([])
    const res = await POST()
    expect(res.status).toBe(400)
  })
})
