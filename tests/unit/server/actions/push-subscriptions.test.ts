import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReturningUpsert = vi.hoisted(() =>
  vi
    .fn()
    .mockResolvedValue([
      { id: 'ps-1', endpoint: 'https://fcm.example.com/abc', p256dh: 'p256', auth: 'auth' },
    ]),
)
const mockOnConflictDoUpdate = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturningUpsert }),
)
const mockValuesInsert = vi.hoisted(() =>
  vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate }),
)
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockValuesInsert }))

const mockWhereDelete = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockDelete = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereDelete }))

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))

vi.mock('@/db', () => ({ db: { insert: mockInsert, delete: mockDelete } }))
vi.mock('@/db/schema', () => ({ pushSubscriptions: {} }))

import { subscribeToPush, unsubscribeFromPush } from '@/server/actions/push-subscriptions'

const validSub = {
  endpoint: 'https://fcm.example.com/abc',
  p256dh: 'p256dh-key',
  auth: 'auth-key',
}

describe('subscribeToPush', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts subscription with valid input', async () => {
    const result = await subscribeToPush(validSub)
    expect(result).toMatchObject({ data: { endpoint: 'https://fcm.example.com/abc' } })
  })

  it('returns error for invalid endpoint', async () => {
    const result = await subscribeToPush({ ...validSub, endpoint: 'not-a-url' })
    expect(result).toHaveProperty('error')
  })

  it('returns error when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await subscribeToPush(validSub)
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns error when p256dh missing', async () => {
    const result = await subscribeToPush({ endpoint: validSub.endpoint, auth: 'auth-key' })
    expect(result).toHaveProperty('error')
  })
})

describe('unsubscribeFromPush', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes subscription by endpoint', async () => {
    const result = await unsubscribeFromPush('https://fcm.example.com/abc')
    expect(result).toMatchObject({ data: { success: true } })
    expect(mockDelete).toHaveBeenCalled()
  })

  it('returns error when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await unsubscribeFromPush('https://fcm.example.com/abc')
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })
})
