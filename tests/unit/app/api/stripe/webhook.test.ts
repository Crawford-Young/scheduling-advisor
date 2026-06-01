import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockWhereUpdate = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockSetUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereUpdate }))
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockSetUpdate }))

const mockWhereSelect = vi.hoisted(() =>
  vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
)
const mockFromSelect = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereSelect }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockFromSelect }))

const mockWhereInsert = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockValuesInsert = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereInsert }))
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockValuesInsert }))

const mockConstructEvent = vi.hoisted(() => vi.fn())
const mockRetrieveSubscription = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ items: { data: [{ current_period_end: 1800000000 }] } }),
)

vi.mock('@/db', () => ({
  db: { update: mockUpdate, select: mockSelect, insert: mockInsert },
}))

vi.mock('@/db/schema', () => ({ users: {}, tokenLedger: {} }))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieveSubscription },
  },
}))

vi.mock('@/env', () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_PRICE_ID_STARTER: 'price_starter',
    STRIPE_PRICE_ID_GROWTH: 'price_growth',
    STRIPE_PRICE_ID_PRO: 'price_pro',
  },
}))

import { POST } from '@/app/api/stripe/webhook/route'

function makeRequest(body = '{}', sig = 'valid-sig'): NextRequest {
  return new NextRequest('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': sig },
  })
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when stripe-signature header is missing', async () => {
    const req = new NextRequest('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when signature verification fails', async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error('Invalid signature')
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
  })

  it('handles checkout.session.completed subscription — sets tier plan and credits tokens', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-123',
          customer: 'cus_abc',
          mode: 'subscription',
          subscription: 'sub_123',
          metadata: { tier: 'pro', credits: '1500' },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'pro', stripeCustomerId: 'cus_abc' }),
    )
    expect(mockInsert).toHaveBeenCalled()
    expect(mockValuesInsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123', type: 'monthly_grant', amount: 1500 }),
    )
  })

  it('handles checkout.session.completed subscription — starter tier', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-123',
          customer: 'cus_abc',
          mode: 'subscription',
          subscription: 'sub_123',
          metadata: { tier: 'starter', credits: '200' },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSetUpdate).toHaveBeenCalledWith(expect.objectContaining({ plan: 'starter' }))
    expect(mockValuesInsert).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 200, type: 'monthly_grant' }),
    )
  })

  it('handles checkout.session.completed pack payment — credits tokens as purchase', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-456',
          customer: null,
          mode: 'payment',
          subscription: null,
          metadata: { pack: 'medium', credits: '300' },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalled()
    expect(mockValuesInsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-456', type: 'purchase', amount: 300 }),
    )
  })

  it('handles checkout.session.completed — skips when no client_reference_id', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: null,
          customer: 'cus_abc',
          mode: 'subscription',
          metadata: { tier: 'pro', credits: '1500' },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('handles invoice.paid — credits monthly_grant for active subscriber', async () => {
    mockWhereSelect.mockReturnValueOnce({
      limit: vi.fn().mockResolvedValue([{ id: 'user-123', plan: 'growth' }]),
    })
    mockConstructEvent.mockReturnValueOnce({
      type: 'invoice.paid',
      data: {
        object: {
          customer: 'cus_abc',
          subscription: 'sub_123',
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalled()
    expect(mockValuesInsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123', type: 'monthly_grant', amount: 600 }),
    )
  })

  it('handles invoice.paid — skips when user has no plan', async () => {
    mockWhereSelect.mockReturnValueOnce({
      limit: vi.fn().mockResolvedValue([{ id: 'user-123', plan: null }]),
    })
    mockConstructEvent.mockReturnValueOnce({
      type: 'invoice.paid',
      data: { object: { customer: 'cus_abc', subscription: null } },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('handles customer.subscription.deleted — sets plan to null', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_abc' } },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSetUpdate).toHaveBeenCalledWith({ plan: null })
  })

  it('handles customer.subscription.updated with active status and known price — sets tier', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_abc',
          status: 'active',
          items: { data: [{ price: { id: 'price_growth' } }] },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSetUpdate).toHaveBeenCalledWith({ plan: 'growth' })
  })

  it('handles customer.subscription.updated with active status and unknown price — no update', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_abc',
          status: 'active',
          items: { data: [{ price: { id: 'price_unknown' } }] },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('handles customer.subscription.updated with past_due — sets plan to null', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_abc',
          status: 'past_due',
          items: { data: [{ price: { id: 'price_pro' } }] },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSetUpdate).toHaveBeenCalledWith({ plan: null })
  })

  it('handles customer.subscription.updated with canceled — sets plan to null', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_abc',
          status: 'canceled',
          items: { data: [{ price: { id: 'price_pro' } }] },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSetUpdate).toHaveBeenCalledWith({ plan: null })
  })

  it('handles customer.subscription.updated with paused — sets plan to null', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_abc',
          status: 'paused',
          items: { data: [{ price: { id: 'price_pro' } }] },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockSetUpdate).toHaveBeenCalledWith({ plan: null })
  })

  it('ignores unknown subscription status', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_abc',
          status: 'trialing',
          items: { data: [{ price: { id: 'price_pro' } }] },
        },
      },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('ignores unhandled event types', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'payment_intent.succeeded',
      data: { object: {} },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
