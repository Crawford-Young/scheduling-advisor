import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── select chain for existing streak lookup: select().from().where().limit() ──
const mockExistingLimit = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockExistingWhere = vi.hoisted(() => vi.fn().mockReturnValue({ limit: mockExistingLimit }))
const mockExistingFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockExistingWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockExistingFrom }))

// ── update chain: update().set().where().returning() ──
const mockTaskReturning = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 't-1', status: 'completed', type: 'habit' }]),
)
const mockTaskWhere = vi.hoisted(() => vi.fn().mockReturnValue({ returning: mockTaskReturning }))
const mockTaskSet = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockTaskWhere }))
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockTaskSet }))

// ── insert chain: insert().values().onConflictDoUpdate().returning() ──
const mockStreakReturning = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 's-1', currentStreak: 1, bestStreak: 1 }]),
)
const mockStreakOnConflict = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockStreakReturning }),
)
const mockStreakValues = vi.hoisted(() =>
  vi.fn().mockReturnValue({ onConflictDoUpdate: mockStreakOnConflict }),
)
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockStreakValues }))

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
  },
}))

vi.mock('@/db/schema', () => ({ tasks: {}, streaks: {} }))
vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }) }))
vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/queries/consistency', () => ({
  getWeeklyConsistency: vi
    .fn()
    .mockResolvedValue({ plannedCount: 5, completedCount: 3, consistencyPct: 60 }),
}))

import { recordCompletion, rescheduleTask } from '@/server/actions/consistency'

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('recordCompletion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await recordCompletion({ taskId: UUID, outcome: 'done' })
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns error when rate limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const result = await recordCompletion({ taskId: UUID, outcome: 'done' })
    expect(result).toMatchObject({ error: 'Too many requests' })
  })

  it('returns error for invalid input', async () => {
    const result = await recordCompletion({ taskId: 'bad', outcome: 'done' })
    expect(result).toHaveProperty('error')
  })

  it('returns streak data on done outcome (new streak)', async () => {
    // existing = [] → no prior streak
    mockExistingLimit.mockResolvedValueOnce([])
    const result = await recordCompletion({ taskId: UUID, outcome: 'done' })
    expect(result).toMatchObject({ data: { currentStreak: 1 } })
  })

  it('increments streak when last completed yesterday', async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    mockExistingLimit.mockResolvedValueOnce([
      {
        currentStreak: 3,
        bestStreak: 5,
        lastCompletedAt: yesterday,
      },
    ])
    mockStreakReturning.mockResolvedValueOnce([{ id: 's-1', currentStreak: 4, bestStreak: 5 }])
    const result = await recordCompletion({ taskId: UUID, outcome: 'done' })
    expect(result).toMatchObject({ data: { currentStreak: 4 } })
  })

  it('resets streak to 1 when gap > 1 day', async () => {
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    mockExistingLimit.mockResolvedValueOnce([
      {
        currentStreak: 7,
        bestStreak: 10,
        lastCompletedAt: threeDaysAgo,
      },
    ])
    mockStreakReturning.mockResolvedValueOnce([{ id: 's-1', currentStreak: 1, bestStreak: 10 }])
    const result = await recordCompletion({ taskId: UUID, outcome: 'done' })
    expect(result).toMatchObject({ data: { currentStreak: 1 } })
  })

  it('resets streak to 0 on skip', async () => {
    mockExistingLimit.mockResolvedValueOnce([
      { currentStreak: 5, bestStreak: 10, lastCompletedAt: new Date() },
    ])
    mockStreakReturning.mockResolvedValueOnce([{ id: 's-1', currentStreak: 0, bestStreak: 10 }])
    const result = await recordCompletion({ taskId: UUID, outcome: 'skip' })
    expect(result).toMatchObject({ data: { currentStreak: 0 } })
  })

  it('handles skip with no existing streak', async () => {
    mockExistingLimit.mockResolvedValueOnce([])
    mockStreakReturning.mockResolvedValueOnce([{ id: 's-1', currentStreak: 0, bestStreak: 0 }])
    const result = await recordCompletion({ taskId: UUID, outcome: 'skip' })
    expect(result).toMatchObject({ data: { currentStreak: 0, bestStreak: 0 } })
  })

  it('sets isPerfectWeek true when all planned completed', async () => {
    const { getWeeklyConsistency } = await import('@/server/queries/consistency')
    vi.mocked(getWeeklyConsistency).mockResolvedValueOnce({
      plannedCount: 5,
      completedCount: 5,
      consistencyPct: 100,
    })
    mockExistingLimit.mockResolvedValueOnce([])
    const result = await recordCompletion({ taskId: UUID, outcome: 'done' })
    expect(result).toMatchObject({ data: { isPerfectWeek: true } })
  })

  it('keeps streak unchanged when completed same day', async () => {
    mockExistingLimit.mockResolvedValueOnce([
      {
        currentStreak: 3,
        bestStreak: 5,
        lastCompletedAt: new Date(),
      },
    ])
    mockStreakReturning.mockResolvedValueOnce([{ id: 's-1', currentStreak: 3, bestStreak: 5 }])
    const result = await recordCompletion({ taskId: UUID, outcome: 'done' })
    expect(result).toMatchObject({ data: { currentStreak: 3 } })
  })

  it('falls back to computed streak when insert returns empty', async () => {
    mockExistingLimit.mockResolvedValueOnce([])
    // Simulate insert returning empty (updated is undefined)
    mockStreakReturning.mockResolvedValueOnce([])
    const result = await recordCompletion({ taskId: UUID, outcome: 'done' })
    expect(result).toMatchObject({ data: { currentStreak: 1, bestStreak: 1 } })
  })
})

describe('rescheduleTask', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await rescheduleTask({ taskId: UUID, newStartAt: new Date().toISOString() })
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns error when rate limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const result = await rescheduleTask({ taskId: UUID, newStartAt: new Date().toISOString() })
    expect(result).toMatchObject({ error: 'Too many requests' })
  })

  it('returns error for invalid input', async () => {
    const result = await rescheduleTask({ taskId: 'bad-uuid' })
    expect(result).toHaveProperty('error')
  })

  it('returns task id on success', async () => {
    mockTaskReturning.mockResolvedValueOnce([{ id: UUID }])
    const result = await rescheduleTask({ taskId: UUID, newStartAt: new Date().toISOString() })
    expect(result).toMatchObject({ data: { id: UUID } })
  })

  it('returns not found when task does not belong to user', async () => {
    mockTaskReturning.mockResolvedValueOnce([])
    const result = await rescheduleTask({ taskId: UUID, newStartAt: new Date().toISOString() })
    expect(result).toMatchObject({ error: 'Not found' })
  })

  it('reschedules with newEndAt and newTargetDate', async () => {
    mockTaskReturning.mockResolvedValueOnce([{ id: UUID }])
    const result = await rescheduleTask({
      taskId: UUID,
      newEndAt: new Date().toISOString(),
      newTargetDate: new Date().toISOString(),
    })
    expect(result).toMatchObject({ data: { id: UUID } })
  })
})
