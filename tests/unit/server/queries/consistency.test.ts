import { describe, it, expect, vi, beforeEach } from 'vitest'

// select().from().where() — dual purpose: .limit() resolves the weekly
// consistency read, awaiting where() directly resolves the streak reads.
const mockRows = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockLimit = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockWhere = vi.hoisted(() =>
  vi.fn(() => {
    const p = mockRows() as Promise<unknown> & { limit: typeof mockLimit }
    p.limit = mockLimit
    return p
  }),
)
const mockFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockFrom }))

vi.mock('@/db', () => ({ db: { select: mockSelect } }))
vi.mock('@/db/schema', () => ({ tasks: {} }))
vi.mock('@/lib/streaks', () => ({
  computePerOccurrenceStreaks: vi.fn().mockReturnValue({}),
}))

import { getWeeklyConsistency, getTaskStreaks } from '@/server/queries/consistency'
import { computePerOccurrenceStreaks } from '@/lib/streaks'

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

describe('getTaskStreaks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty object for empty taskIds', async () => {
    expect(await getTaskStreaks('user-1', [])).toEqual({})
  })

  it('returns empty object when no requested rows belong to a group', async () => {
    mockRows.mockResolvedValueOnce([{ id: 'a', groupId: null }])
    expect(await getTaskStreaks('user-1', ['a'])).toEqual({})
  })

  it('maps sibling rows in one group to DIFFERENT per-occurrence values', async () => {
    vi.mocked(computePerOccurrenceStreaks).mockReturnValue({ a: 1, b: 2 })
    mockRows
      .mockResolvedValueOnce([
        { id: 'a', groupId: 'g1' },
        { id: 'b', groupId: 'g1' },
      ])
      .mockResolvedValueOnce([
        { id: 'a', groupId: 'g1', startAt: new Date('2026-07-06T10:00:00Z'), status: 'completed' },
        { id: 'b', groupId: 'g1', startAt: new Date('2026-07-08T10:00:00Z'), status: 'pending' },
      ])
    expect(await getTaskStreaks('user-1', ['a', 'b'])).toEqual({ a: 1, b: 2 })
  })

  it('skips null-group occurrence rows and defaults groups with no occurrences to 0', async () => {
    vi.mocked(computePerOccurrenceStreaks).mockReturnValue({ a: 3 })
    mockRows
      .mockResolvedValueOnce([
        { id: 'a', groupId: 'g1' },
        { id: 'd', groupId: 'g2' },
      ])
      .mockResolvedValueOnce([
        { id: 'a', groupId: 'g1', startAt: new Date('2026-07-06T10:00:00Z'), status: 'completed' },
        { id: 'z', groupId: null, startAt: new Date('2026-07-06T10:00:00Z'), status: 'completed' },
      ])
    // g1 resolves via computePerOccurrenceStreaks; g2 has no occurrences → falls back to 0.
    expect(await getTaskStreaks('user-1', ['a', 'd'])).toEqual({ a: 3, d: 0 })
  })

  it('omits null-group rows from the map', async () => {
    vi.mocked(computePerOccurrenceStreaks).mockReturnValue({ a: 2 })
    mockRows
      .mockResolvedValueOnce([
        { id: 'a', groupId: 'g1' },
        { id: 'c', groupId: null },
      ])
      .mockResolvedValueOnce([
        { id: 'a', groupId: 'g1', startAt: new Date('2026-07-06T10:00:00Z'), status: 'completed' },
      ])
    const result = await getTaskStreaks('user-1', ['a', 'c'])
    expect(result).toEqual({ a: 2 })
    expect(result).not.toHaveProperty('c')
  })

  it("passes each row's persisted time_zone through to computePerOccurrenceStreaks (wave 2.6 S13)", async () => {
    vi.mocked(computePerOccurrenceStreaks).mockReturnValue({ a: 1 })
    mockRows.mockResolvedValueOnce([{ id: 'a', groupId: 'g1' }]).mockResolvedValueOnce([
      {
        id: 'a',
        groupId: 'g1',
        startAt: new Date('2026-07-06T10:00:00Z'),
        status: 'completed',
        timeZone: 'America/New_York',
      },
    ])
    await getTaskStreaks('user-1', ['a'])
    expect(computePerOccurrenceStreaks).toHaveBeenCalledWith(
      [
        {
          id: 'a',
          startAt: new Date('2026-07-06T10:00:00Z'),
          status: 'completed',
          timeZone: 'America/New_York',
        },
      ],
      expect.any(Date),
    )
  })
})
