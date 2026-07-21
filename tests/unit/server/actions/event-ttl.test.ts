import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelectWhere = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockSelectFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockSelectWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockSelectFrom }))

const mockDeleteReturning = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockDeleteWhere = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockDeleteReturning }),
)
const mockDelete = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockDeleteWhere }))

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))

vi.mock('@/db', () => ({ db: { select: mockSelect, delete: mockDelete } }))

vi.mock('@/db/schema', () => ({
  events: {
    userId: 'events.userId',
    activityId: 'events.activityId',
    status: 'events.status',
    endAt: 'events.endAt',
    id: 'events.id',
  },
  calendarPrefs: {
    userId: 'calendarPrefs.userId',
    ttlDays: 'calendarPrefs.ttlDays',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  ne: vi.fn((col: unknown, val: unknown) => ({ op: 'ne', col, val })),
  lt: vi.fn((col: unknown, val: unknown) => ({ op: 'lt', col, val })),
  isNull: vi.fn((col: unknown) => ({ op: 'isNull', col })),
  isNotNull: vi.fn((col: unknown) => ({ op: 'isNotNull', col })),
}))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { deleteExpiredEvents, safeDeleteExpiredEvents } from '@/server/actions/event-ttl'
import { and, eq, ne, lt, isNull, isNotNull } from 'drizzle-orm'
import * as Sentry from '@sentry/nextjs'

describe('deleteExpiredEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectWhere.mockResolvedValue([])
    mockDeleteReturning.mockResolvedValue([])
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await deleteExpiredEvents()

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('no-ops with 0 deleted when no calendarPrefs row exists', async () => {
    mockSelectWhere.mockResolvedValueOnce([])

    const result = await deleteExpiredEvents()

    expect(result).toEqual({ data: { deleted: 0 } })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('no-ops with 0 deleted when ttlDays is null (TTL disabled)', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ ttlDays: null }])

    const result = await deleteExpiredEvents()

    expect(result).toEqual({ data: { deleted: 0 } })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('computes the cutoff as now minus ttlDays days', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'))
    mockSelectWhere.mockResolvedValueOnce([{ ttlDays: 30 }])
    mockDeleteReturning.mockResolvedValueOnce([])

    await deleteExpiredEvents()

    const cutoffArg = vi.mocked(lt).mock.calls[0]![1] as Date
    expect(cutoffArg.toISOString()).toBe('2026-06-01T00:00:00.000Z')

    vi.useRealTimers()
  })

  it('composes the WHERE clause scoping to standalone (activityId IS NULL), non-completed events', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ ttlDays: 14 }])
    mockDeleteReturning.mockResolvedValueOnce([])

    await deleteExpiredEvents()

    expect(vi.mocked(eq).mock.calls).toContainEqual(['events.userId', 'user-123'])
    expect(vi.mocked(isNull).mock.calls).toContainEqual(['events.activityId'])
    expect(vi.mocked(ne).mock.calls).toContainEqual(['events.status', 'completed'])
    expect(vi.mocked(isNotNull).mock.calls).toContainEqual(['events.endAt'])
    expect(vi.mocked(lt).mock.calls[0]![0]).toBe('events.endAt')
    expect(vi.mocked(and)).toHaveBeenCalled()
    expect(mockDeleteWhere).toHaveBeenCalled()
  })

  it('returns the deleted count from the query result', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ ttlDays: 7 }])
    mockDeleteReturning.mockResolvedValueOnce([{ id: 'e1' }, { id: 'e2' }])

    const result = await deleteExpiredEvents()

    expect(result).toEqual({ data: { deleted: 2 } })
  })
})

describe('safeDeleteExpiredEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectWhere.mockResolvedValue([])
    mockDeleteReturning.mockResolvedValue([])
  })

  it('resolves without throwing when deleteExpiredEvents succeeds', async () => {
    await expect(safeDeleteExpiredEvents()).resolves.toBeUndefined()
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('swallows thrown errors and reports them to Sentry instead of throwing', async () => {
    const dbError = new Error('db unreachable')
    mockSelectWhere.mockRejectedValueOnce(dbError)

    await expect(safeDeleteExpiredEvents()).resolves.toBeUndefined()

    expect(Sentry.captureException).toHaveBeenCalledWith(dbError)
  })
})
