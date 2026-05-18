import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const mockFindFirst = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    userId: 'user-1',
    totalPoints: 500,
    currentLevel: 'growing',
    weeklyPoints: 100,
    currentStreak: 3,
    bestStreak: 7,
    multiplier: '1.0',
    updatedAt: new Date(),
  }),
)

const mockLeaderboardLimit = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    { userId: 'user-1', name: 'Alice', image: null, points: 500 },
    { userId: 'user-2', name: 'Bob', image: null, points: 300 },
  ]),
)
const mockLeaderboardOrderBy = vi.hoisted(() =>
  vi.fn().mockReturnValue({ limit: mockLeaderboardLimit }),
)
const mockLeaderboardWhere = vi.hoisted(() =>
  vi.fn().mockReturnValue({ orderBy: mockLeaderboardOrderBy }),
)
const mockLeaderboardLeftJoin = vi.hoisted(() =>
  vi.fn().mockReturnValue({ where: mockLeaderboardWhere }),
)
const mockLeaderboardFrom = vi.hoisted(() =>
  vi.fn().mockReturnValue({ leftJoin: mockLeaderboardLeftJoin }),
)
// mockLeaderboardSelect is defined via the shared mockSelect below

const mockHistoryLimit = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    { week: 'Apr 14', points: 120 },
    { week: 'Apr 21', points: 85 },
  ]),
)
const mockHistoryOrderBy = vi.hoisted(() => vi.fn().mockReturnValue({ limit: mockHistoryLimit }))
const mockHistoryWhere = vi.hoisted(() => vi.fn().mockReturnValue({ orderBy: mockHistoryOrderBy }))
const mockHistoryFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockHistoryWhere }))
// mockHistorySelect is defined via the shared mockSelect below

let selectCallCount = 0
const mockSelect = vi.hoisted(() =>
  vi.fn().mockImplementation(() => {
    selectCallCount++
    // first call (leaderboard), second call (history)
    return selectCallCount % 2 === 1 ? { from: mockLeaderboardFrom } : { from: mockHistoryFrom }
  }),
)

vi.mock('@/db', () => ({
  db: {
    query: {
      userStats: { findFirst: mockFindFirst },
    },
    select: mockSelect,
  },
}))
vi.mock('@/db/schema', () => ({ userStats: {}, pointEvents: {}, users: {} }))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  sql: Object.assign(vi.fn().mockReturnValue('sql-expr'), { raw: vi.fn() }),
  and: vi.fn(),
  gte: vi.fn(),
}))

import { getUserStats, getLeaderboard, getPersonalHistory } from '@/server/queries/points'

describe('getUserStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0
  })

  it('returns stats object when found', async () => {
    const result = await getUserStats('user-1')
    expect(result).toMatchObject({ userId: 'user-1', totalPoints: 500 })
    expect(mockFindFirst).toHaveBeenCalledOnce()
  })

  it('returns undefined when not found', async () => {
    mockFindFirst.mockResolvedValueOnce(undefined)
    const result = await getUserStats('user-missing')
    expect(result).toBeUndefined()
  })
})

describe('getLeaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0
    mockSelect.mockImplementation(() => ({ from: mockLeaderboardFrom }))
  })

  it('returns an array for alltime timeframe', async () => {
    const result = await getLeaderboard('alltime')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns an array for week timeframe', async () => {
    const result = await getLeaderboard('week')
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns an array for month timeframe', async () => {
    const result = await getLeaderboard('month')
    expect(Array.isArray(result)).toBe(true)
  })

  it('calls select and chains query builders', async () => {
    await getLeaderboard('alltime')
    expect(mockSelect).toHaveBeenCalled()
    expect(mockLeaderboardFrom).toHaveBeenCalled()
    expect(mockLeaderboardLeftJoin).toHaveBeenCalled()
    expect(mockLeaderboardWhere).toHaveBeenCalled()
    expect(mockLeaderboardOrderBy).toHaveBeenCalled()
    expect(mockLeaderboardLimit).toHaveBeenCalled()
  })
})

describe('getPersonalHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 1 // force to use history mocks
    mockSelect.mockImplementation(() => ({ from: mockHistoryFrom }))
  })

  it('returns an array of week scores', async () => {
    const result = await getPersonalHistory('user-1')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns empty array when no history', async () => {
    mockHistoryLimit.mockResolvedValueOnce([])
    const result = await getPersonalHistory('user-1')
    expect(result).toEqual([])
  })

  it('calls select and chains query builders', async () => {
    await getPersonalHistory('user-1')
    expect(mockSelect).toHaveBeenCalled()
    expect(mockHistoryFrom).toHaveBeenCalled()
    expect(mockHistoryWhere).toHaveBeenCalled()
    expect(mockHistoryOrderBy).toHaveBeenCalled()
    expect(mockHistoryLimit).toHaveBeenCalled()
  })
})
