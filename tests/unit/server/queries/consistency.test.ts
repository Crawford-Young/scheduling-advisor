import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLimit = vi.hoisted(() => vi.fn())
const mockWhere = vi.hoisted(() => vi.fn().mockReturnValue({ limit: mockLimit }))
const mockFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockFrom }))
const mockFindFirst = vi.hoisted(() => vi.fn())

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
    query: { streaks: { findFirst: mockFindFirst } },
  },
}))
vi.mock('@/db/schema', () => ({ tasks: {}, streaks: {} }))

import { getWeeklyConsistency, getTaskStreak, getTaskStreaks } from '@/server/queries/consistency'

describe('getWeeklyConsistency', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns planned and completed counts', async () => {
    mockLimit.mockResolvedValueOnce([
      { status: 'completed' },
      { status: 'pending' },
      { status: 'completed' },
    ])
    const result = await getWeeklyConsistency('user-1')
    expect(result).toEqual({
      plannedCount: 3,
      completedCount: 2,
      consistencyPct: expect.any(Number),
    })
  })

  it('returns zero counts when no tasks', async () => {
    mockLimit.mockResolvedValueOnce([])
    const result = await getWeeklyConsistency('user-1')
    expect(result).toEqual({ plannedCount: 0, completedCount: 0, consistencyPct: 0 })
  })

  it('returns 100% when all tasks completed', async () => {
    mockLimit.mockResolvedValueOnce([{ status: 'completed' }, { status: 'completed' }])
    const result = await getWeeklyConsistency('user-1')
    expect(result.consistencyPct).toBe(100)
  })
})

describe('getTaskStreak', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns streak data when row exists', async () => {
    // getTaskStreak uses select().from().where().limit(1)
    mockWhere.mockReturnValueOnce({
      limit: vi.fn().mockResolvedValue([{ currentStreak: 7, bestStreak: 10 }]),
    })
    const result = await getTaskStreak('user-1', 'task-1')
    expect(result).toEqual({ currentStreak: 7, bestStreak: 10 })
  })

  it('returns zeros when no row found', async () => {
    mockWhere.mockReturnValueOnce({ limit: vi.fn().mockResolvedValue([]) })
    const result = await getTaskStreak('user-1', 'task-1')
    expect(result).toEqual({ currentStreak: 0, bestStreak: 0 })
  })
})

describe('getTaskStreaks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty object for empty taskIds', async () => {
    const result = await getTaskStreaks('user-1', [])
    expect(result).toEqual({})
  })

  it('returns map of taskId to currentStreak', async () => {
    mockWhere.mockResolvedValueOnce([
      { taskId: 'task-a', currentStreak: 3 },
      { taskId: 'task-b', currentStreak: 5 },
    ])
    const result = await getTaskStreaks('user-1', ['task-a', 'task-b'])
    expect(result).toEqual({ 'task-a': 3, 'task-b': 5 })
  })
})
