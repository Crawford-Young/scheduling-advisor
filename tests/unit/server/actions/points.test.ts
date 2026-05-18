import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const mockFindFirst = vi.hoisted(() => vi.fn())

const mockWhereUpdate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockSetUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereUpdate }))
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockSetUpdate }))

const mockValuesInsert = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockValuesInsert }))

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))
vi.mock('@/db', () => ({
  db: {
    query: {
      userStats: { findFirst: mockFindFirst },
    },
    insert: mockInsert,
    update: mockUpdate,
  },
}))
vi.mock('@/db/schema', () => ({ pointEvents: {}, userStats: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }))

import { auth } from '@/auth'
import { ratelimit } from '@/lib/redis'
import { awardPoints } from '@/server/actions/points'

const authedSession = { user: { id: 'user-1' } } as unknown as Awaited<ReturnType<typeof auth>>

const existingStats = {
  userId: 'user-1',
  totalPoints: 100,
  weeklyPoints: 20,
  currentLevel: 'seedling' as const,
  multiplier: '1.0',
  currentStreak: 3,
  bestStreak: 5,
  updatedAt: new Date(),
}

describe('awardPoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(authedSession)
    mockFindFirst.mockResolvedValue(existingStats)
  })

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const result = await awardPoints('habit_complete')
    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('returns error when rate limited', async () => {
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const result = await awardPoints('habit_complete')
    expect(result).toEqual({ error: 'Too many requests' })
  })

  it('returns pointsAwarded on success for habit_complete', async () => {
    const result = await awardPoints('habit_complete')
    expect(result).toHaveProperty('pointsAwarded')
    expect(typeof result.pointsAwarded).toBe('number')
    expect(result.pointsAwarded).toBeGreaterThan(0)
  })

  it('awards base 10 points for habit_complete with multiplier 1.0', async () => {
    mockFindFirst.mockResolvedValueOnce({ ...existingStats, multiplier: '1.0' })
    const result = await awardPoints('habit_complete')
    expect(result.pointsAwarded).toBe(10)
  })

  it('applies multiplier correctly for habit_complete', async () => {
    mockFindFirst.mockResolvedValueOnce({ ...existingStats, multiplier: '1.5' })
    const result = await awardPoints('habit_complete')
    expect(result.pointsAwarded).toBe(15)
  })

  it('does not apply multiplier for goal_complete', async () => {
    mockFindFirst.mockResolvedValueOnce({ ...existingStats, multiplier: '2.0' })
    const result = await awardPoints('goal_complete')
    expect(result.pointsAwarded).toBe(200)
  })

  it('awards correct points for goal_milestone', async () => {
    const result = await awardPoints('goal_milestone')
    expect(result.pointsAwarded).toBe(50)
  })

  it('awards correct points for perfect_day', async () => {
    const result = await awardPoints('perfect_day')
    expect(result.pointsAwarded).toBe(25)
  })

  it('awards correct points for perfect_week', async () => {
    const result = await awardPoints('perfect_week')
    expect(result.pointsAwarded).toBe(100)
  })

  it('uses multiplier 1.0 when no existing stats', async () => {
    mockFindFirst.mockResolvedValueOnce(undefined)
    const result = await awardPoints('habit_complete')
    expect(result.pointsAwarded).toBe(10)
  })

  it('inserts a point event record', async () => {
    await awardPoints('habit_complete')
    expect(mockInsert).toHaveBeenCalled()
    expect(mockValuesInsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'habit_complete', points: 10 }),
    )
  })

  it('updates userStats after awarding points', async () => {
    await awardPoints('habit_complete')
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ totalPoints: 110, weeklyPoints: 30 }),
    )
  })

  it('passes referenceId through when provided', async () => {
    await awardPoints('goal_milestone', 'ref-abc')
    expect(mockValuesInsert).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: 'ref-abc' }),
    )
  })
})
