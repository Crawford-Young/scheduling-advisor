import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockOrderBy = vi.hoisted(() => vi.fn().mockResolvedValue([{ id: 'evt-1', title: 'Lunch' }]))
const mockWhere = vi.hoisted(() => vi.fn().mockReturnValue({ orderBy: mockOrderBy }))
const mockFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockFrom }))

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))
vi.mock('@/db', () => ({ db: { select: mockSelect } }))
vi.mock('@/db/schema', () => ({
  events: {
    id: 'events.id',
    userId: 'events.userId',
    activityId: 'events.activityId',
    seriesId: 'events.seriesId',
    startAt: 'events.startAt',
    endAt: 'events.endAt',
    createdAt: 'events.createdAt',
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  gte: vi.fn((col: unknown, val: unknown) => ({ op: 'gte', col, val })),
  asc: vi.fn((col: unknown) => ({ op: 'asc', col })),
  desc: vi.fn((col: unknown) => ({ op: 'desc', col })),
  isNull: vi.fn((col: unknown) => ({ op: 'isNull', col })),
}))

import { getUserEvents, getStandaloneEvents } from '@/server/queries/events'
import { events } from '@/db/schema'
import { isNull, asc } from 'drizzle-orm'

describe('getUserEvents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns events for the authenticated user', async () => {
    const result = await getUserEvents()

    expect(result).toEqual([{ id: 'evt-1', title: 'Lunch' }])
    expect(mockSelect).toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledWith(events)
  })

  it('returns empty array when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await getUserEvents()

    expect(result).toEqual([])
    expect(mockSelect).not.toHaveBeenCalled()
  })
})

describe('getStandaloneEvents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes to standalone (activityId IS NULL) events for the user, ordered by startAt, including past events', async () => {
    const result = await getStandaloneEvents()

    expect(result).toEqual([{ id: 'evt-1', title: 'Lunch' }])
    expect(mockFrom).toHaveBeenCalledWith(events)
    expect(vi.mocked(isNull).mock.calls).toContainEqual([events.activityId])
    expect(vi.mocked(asc).mock.calls[0]?.[0]).toBe(events.startAt)
  })

  it('also excludes standalone-series occurrences (seriesId IS NULL) — those render under Repeating events, not here', async () => {
    await getStandaloneEvents()

    expect(vi.mocked(isNull).mock.calls).toContainEqual([events.seriesId])
  })

  it('does not filter by endAt (past standalone events remain visible/editable)', async () => {
    await getStandaloneEvents()

    const { gte } = await import('drizzle-orm')
    expect(vi.mocked(gte)).not.toHaveBeenCalled()
  })

  it('returns empty array when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await getStandaloneEvents()

    expect(result).toEqual([])
    expect(mockSelect).not.toHaveBeenCalled()
  })
})
