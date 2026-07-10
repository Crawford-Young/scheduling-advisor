import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── update().set().where()  — status flip (no returning) — and
//    update().set().where().returning() for rescheduleTask ──
const mockUpdateReturning = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: '550e8400-e29b-41d4-a716-446655440000' }]),
)
const mockUpdateWhere = vi.hoisted(() =>
  vi.fn(() => {
    const p = Promise.resolve(undefined) as Promise<unknown> & {
      returning: typeof mockUpdateReturning
    }
    p.returning = mockUpdateReturning
    return p
  }),
)
const mockUpdateSet = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockUpdateWhere }))
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockUpdateSet }))

// ── select().from().where() — dual purpose: .limit(1) resolves the group
//    lookup, awaiting the where() directly resolves the occurrence rows ──
const mockGroupRows = vi.hoisted(() => vi.fn().mockResolvedValue([{ groupId: null }]))
const mockOccurrences = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockSelectWhere = vi.hoisted(() =>
  vi.fn(() => {
    const p = mockOccurrences() as Promise<unknown> & { limit: () => unknown }
    p.limit = () => mockGroupRows()
    return p
  }),
)
const mockFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockSelectWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockFrom }))

// A streaks-table write would go through db.insert — it must never be called.
const mockInsert = vi.hoisted(() => vi.fn())

vi.mock('@/db', () => ({
  db: { select: mockSelect, update: mockUpdate, insert: mockInsert },
}))
vi.mock('@/db/schema', () => ({ tasks: {} }))
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
vi.mock('@/lib/streaks', () => ({
  computeGroupStreak: vi.fn().mockReturnValue({ current: 0, best: 0 }),
  computePerOccurrenceStreaks: vi.fn().mockReturnValue({}),
}))

import { recordCompletion, rescheduleTask } from '@/server/actions/consistency'
import { computeGroupStreak, computePerOccurrenceStreaks } from '@/lib/streaks'

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('recordCompletion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    expect(await recordCompletion({ taskId: UUID })).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns error when rate limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    expect(await recordCompletion({ taskId: UUID })).toMatchObject({ error: 'Too many requests' })
  })

  it('returns error for invalid input', async () => {
    expect(await recordCompletion({ taskId: '' })).toHaveProperty('error')
  })

  it('flips the task status to completed', async () => {
    await recordCompletion({ taskId: UUID })
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }))
  })

  it('never writes to a streaks table', async () => {
    await recordCompletion({ taskId: UUID })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it("sets currentStreak from the completed row's own per-occurrence value; bestStreak stays group-level", async () => {
    mockGroupRows.mockResolvedValueOnce([{ groupId: 'g1' }])
    const occ = [{ id: UUID, startAt: new Date('2026-07-06T10:00:00Z'), status: 'completed' }]
    mockOccurrences.mockResolvedValue(occ)
    vi.mocked(computePerOccurrenceStreaks).mockReturnValueOnce({ [UUID]: 4 })
    vi.mocked(computeGroupStreak).mockReturnValueOnce({ current: 999, best: 6 })
    const result = await recordCompletion({ taskId: UUID })
    expect(result).toMatchObject({ data: { currentStreak: 4, bestStreak: 6 } })
    expect(computePerOccurrenceStreaks).toHaveBeenCalledWith(occ, expect.any(Date))
    expect(computeGroupStreak).toHaveBeenCalledWith(occ, expect.any(Date))
  })

  it('falls back to 0 when the completed row is absent from the per-occurrence map', async () => {
    mockGroupRows.mockResolvedValueOnce([{ groupId: 'g1' }])
    const occ = [{ id: UUID, startAt: new Date('2026-07-06T10:00:00Z'), status: 'completed' }]
    mockOccurrences.mockResolvedValue(occ)
    vi.mocked(computePerOccurrenceStreaks).mockReturnValueOnce({})
    vi.mocked(computeGroupStreak).mockReturnValueOnce({ current: 0, best: 6 })
    const result = await recordCompletion({ taskId: UUID })
    expect(result).toMatchObject({ data: { currentStreak: 0, bestStreak: 6 } })
  })

  it('returns a zero streak for a non-recurring (null group) task without computing', async () => {
    mockGroupRows.mockResolvedValueOnce([{ groupId: null }])
    const result = await recordCompletion({ taskId: UUID })
    expect(result).toMatchObject({ data: { currentStreak: 0, bestStreak: 0 } })
    expect(computeGroupStreak).not.toHaveBeenCalled()
    expect(computePerOccurrenceStreaks).not.toHaveBeenCalled()
  })

  it('sets isPerfectWeek true when all planned tasks are completed', async () => {
    const { getWeeklyConsistency } = await import('@/server/queries/consistency')
    vi.mocked(getWeeklyConsistency).mockResolvedValueOnce({
      plannedCount: 5,
      completedCount: 5,
      consistencyPct: 100,
    })
    expect(await recordCompletion({ taskId: UUID })).toMatchObject({
      data: { isPerfectWeek: true },
    })
  })

  it('sets isPerfectWeek false when not all planned tasks are completed', async () => {
    expect(await recordCompletion({ taskId: UUID })).toMatchObject({
      data: { isPerfectWeek: false },
    })
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
    mockUpdateReturning.mockResolvedValueOnce([{ id: UUID }])
    const result = await rescheduleTask({ taskId: UUID, newStartAt: new Date().toISOString() })
    expect(result).toMatchObject({ data: { id: UUID } })
  })

  it('returns not found when task does not belong to user', async () => {
    mockUpdateReturning.mockResolvedValueOnce([])
    const result = await rescheduleTask({ taskId: UUID, newStartAt: new Date().toISOString() })
    expect(result).toMatchObject({ error: 'Not found' })
  })

  it('reschedules with newEndAt and newTargetDate', async () => {
    mockUpdateReturning.mockResolvedValueOnce([{ id: UUID }])
    const result = await rescheduleTask({
      taskId: UUID,
      newEndAt: new Date().toISOString(),
      newTargetDate: new Date().toISOString(),
    })
    expect(result).toMatchObject({ data: { id: UUID } })
  })

  it('rejects a grouped row with the series-managed error and does not update', async () => {
    mockGroupRows.mockResolvedValueOnce([{ recurrenceGroupId: 'grp-1' }])
    const result = await rescheduleTask({ taskId: UUID, newStartAt: new Date().toISOString() })
    expect(result).toMatchObject({
      error: 'Grouped rows are series-managed — use updateSeries',
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('leaves an ungrouped row unchanged (passes, writes)', async () => {
    mockGroupRows.mockResolvedValueOnce([{ recurrenceGroupId: null }])
    mockUpdateReturning.mockResolvedValueOnce([{ id: UUID }])
    const result = await rescheduleTask({ taskId: UUID, newStartAt: new Date().toISOString() })
    expect(result).toMatchObject({ data: { id: UUID } })
    expect(mockUpdate).toHaveBeenCalled()
  })
})
