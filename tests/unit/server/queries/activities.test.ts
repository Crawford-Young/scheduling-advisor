import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockOrderBy = vi.hoisted(() => vi.fn().mockResolvedValue([{ id: 'act-1', title: 'Gym' }]))
const mockWhere = vi.hoisted(() => vi.fn().mockReturnValue({ orderBy: mockOrderBy }))
const mockFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockFrom }))

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))
vi.mock('@/db', () => ({ db: { select: mockSelect } }))
vi.mock('@/db/schema', () => ({ activities: {} }))

import { getUserActivities } from '@/server/queries/activities'

describe('getUserActivities', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns activities for the authenticated user', async () => {
    const result = await getUserActivities()

    expect(result).toEqual([{ id: 'act-1', title: 'Gym' }])
    expect(mockSelect).toHaveBeenCalled()
  })

  it('returns empty array when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await getUserActivities()

    expect(result).toEqual([])
  })
})
