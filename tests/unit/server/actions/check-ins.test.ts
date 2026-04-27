import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReturningInsert = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 'ci-1', scheduledAt: new Date() }]),
)
const mockValuesInsert = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturningInsert }),
)
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockValuesInsert }))

const mockReturningUpdate = vi.hoisted(() => vi.fn().mockResolvedValue([{ id: 'ci-1', rating: 4 }]))
const mockWhereUpdate = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturningUpdate }),
)
const mockSetUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereUpdate }))
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockSetUpdate }))

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))

vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))

vi.mock('@/db', () => ({ db: { insert: mockInsert, update: mockUpdate } }))
vi.mock('@/db/schema', () => ({ checkIns: {} }))

import { createCheckIn, completeCheckIn } from '@/server/actions/check-ins'

describe('createCheckIn', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates check-in without taskId', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'ci-1', scheduledAt: new Date() }])
    mockValuesInsert.mockReturnValue({ returning: mockReturningInsert })
    mockInsert.mockReturnValue({ values: mockValuesInsert })
    const result = await createCheckIn({ scheduledAt: new Date().toISOString() })
    expect(result).toMatchObject({ data: { id: 'ci-1' } })
  })

  it('returns error for invalid scheduledAt', async () => {
    const result = await createCheckIn({ scheduledAt: 'not-a-date' })
    expect(result).toHaveProperty('error')
  })
})

describe('completeCheckIn', () => {
  it('completes check-in with rating', async () => {
    const result = await completeCheckIn({
      id: '550e8400-e29b-41d4-a716-446655440000',
      rating: 4,
    })
    expect(result).toMatchObject({ data: { rating: 4 } })
  })

  it('returns error for rating out of range', async () => {
    const result = await completeCheckIn({
      id: '550e8400-e29b-41d4-a716-446655440000',
      rating: 6,
    })
    expect(result).toHaveProperty('error')
  })
})
