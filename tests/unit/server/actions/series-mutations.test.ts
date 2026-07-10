import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockReturningInsert = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 'new-1', title: 'Run', type: 'task' }]),
)
const mockValuesInsert = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturningInsert }),
)
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockValuesInsert }))

const mockReturningUpdate = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 'task-1', title: 'Run', type: 'task' }]),
)
const mockWhereUpdate = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturningUpdate }),
)
const mockSetUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereUpdate }))
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockSetUpdate }))

const mockWhereDelete = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockDelete = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereDelete }))

const mockSelectWhere = vi.hoisted(() => vi.fn())
const mockSelectFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockSelectWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockSelectFrom }))

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))

vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn() } }))

vi.mock('@/db', () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    select: mockSelect,
  },
}))

vi.mock('@/db/schema', () => ({
  tasks: {
    id: 'tasks.id',
    userId: 'tasks.userId',
    recurrenceGroupId: 'tasks.recurrenceGroupId',
    recurrenceCount: 'tasks.recurrenceCount',
    recurrence: 'tasks.recurrence',
    status: 'tasks.status',
    startAt: 'tasks.startAt',
  },
}))

// Recording stubs so the pattern-change delete predicate can be asserted exactly.
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  gt: vi.fn((col: unknown, val: unknown) => ({ op: 'gt', col, val })),
  isNull: vi.fn((col: unknown) => ({ op: 'isNull', col })),
  isNotNull: vi.fn((col: unknown) => ({ op: 'isNotNull', col })),
  inArray: vi.fn((col: unknown, val: unknown) => ({ op: 'inArray', col, val })),
}))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import {
  updateSeries,
  extendSeries,
  safeExtendSeries,
  SERIES_SHARED_FIELDS,
} from '@/server/actions/series-mutations'
import { isNull, isNotNull, inArray, eq } from 'drizzle-orm'
import { SUPPORTED_RECURRENCES } from '@/lib/series-generation'
import * as Sentry from '@sentry/nextjs'

const VALID_ID = '550e8400-e29b-41d4-a716-446655440000'

interface Row {
  id: string
  userId: string
  title: string
  type: 'task' | 'goal'
  recurrence: string | null
  recurrenceGroupId: string | null
  recurrenceDays: readonly string[] | null
  recurrenceCount: number | null
  status: string
  targetDate: Date | null
  startAt: Date | null
  endAt: Date | null
  location: string | null
  description: string | null
  color: string | null
  allDay: boolean
}

const row = (overrides: Partial<Row> = {}): Row => ({
  id: 'task-1',
  userId: 'user-123',
  title: 'Run',
  type: 'task',
  recurrence: 'weekly',
  recurrenceGroupId: 'grp-1',
  recurrenceDays: ['Mon'],
  recurrenceCount: null,
  status: 'pending',
  targetDate: null,
  startAt: new Date('2026-05-11T09:00:00.000Z'),
  endAt: new Date('2026-05-11T10:00:00.000Z'),
  location: null,
  description: null,
  color: null,
  allDay: false,
  ...overrides,
})

// now = Monday 2026-05-18 (UTC). Its week Sunday is 2026-05-17.
const MONDAY = new Date('2026-05-18T00:00:00.000Z')

const primeSelect = (anchor: readonly Row[], groupRows?: readonly Row[]): void => {
  mockSelectWhere.mockReturnValueOnce({ limit: vi.fn().mockResolvedValue(anchor) })
  if (groupRows !== undefined) {
    mockSelectWhere.mockReturnValueOnce(Promise.resolve(groupRows))
  }
}

const insertedRows = () =>
  mockValuesInsert.mock.calls[0]![0] as Array<{
    startAt: Date
    endAt: Date | null
    recurrenceGroupId: string | null
    recurrenceDays: readonly string[] | null
    recurrenceCount: number | null
    recurrence: string | null
    title: string
    color: string | null
    type: string
  }>

const setArgs = () =>
  mockSetUpdate.mock.calls.map(
    (c) =>
      c[0] as {
        title?: string
        color?: string | null
        recurrence?: string | null
        recurrenceDays?: readonly string[] | null
        recurrenceCount?: number | null
        recurrenceGroupId?: string
        startAt?: Date
        endAt?: Date | null
      },
  )

beforeEach(() => {
  vi.clearAllMocks()
  mockSelectWhere.mockReset()
  mockReturningInsert.mockResolvedValue([{ id: 'new-1', title: 'Run', type: 'task' }])
  mockReturningUpdate.mockResolvedValue([{ id: 'task-1', title: 'Run', type: 'task' }])
  mockWhereDelete.mockResolvedValue(undefined)
  vi.useFakeTimers({ now: MONDAY })
})

afterEach(() => vi.useRealTimers())

describe('SERIES_SHARED_FIELDS', () => {
  it('lists exactly the shared fields the contract promises', () => {
    expect(SERIES_SHARED_FIELDS).toEqual([
      'title',
      'color',
      'location',
      'description',
      'allDay',
      'recurrence',
      'recurrenceDays',
      'recurrenceCount',
    ])
  })
})

describe('updateSeries — prologue', () => {
  it('returns Unauthorized when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await updateSeries({ taskId: VALID_ID, title: 'x' })
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns Too many requests when rate limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const result = await updateSeries({ taskId: VALID_ID, title: 'x' })
    expect(result).toMatchObject({ error: 'Too many requests' })
  })

  it('returns an error for invalid input (bad uuid)', async () => {
    const result = await updateSeries({ taskId: 'not-a-uuid' })
    expect(result).toHaveProperty('error')
  })

  it('returns Not found when the anchor task does not exist', async () => {
    primeSelect([])
    const result = await updateSeries({ taskId: VALID_ID, title: 'x' })
    expect(result).toMatchObject({ error: 'Not found' })
  })
})

describe('updateSeries — materialize a one-off', () => {
  it("returns 'Not a series' for an ungrouped, null-startAt row given a pattern", async () => {
    primeSelect([row({ recurrenceGroupId: null, startAt: null })])
    const result = await updateSeries({ taskId: VALID_ID, recurrence: 'weekly' })
    expect(result).toMatchObject({ error: 'Not a series' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("materializes a pattern edit: stamps a group id and fans rows into the ANCHOR's week (not now's week)", async () => {
    // Anchor is a FUTURE Monday (2026-06-15), four weeks past `now`. The window
    // must start from the anchor's own week, so generated rows land there — never
    // in the week of `now` (2026-05-18).
    const anchor = row({
      recurrenceGroupId: null,
      startAt: new Date('2026-06-15T09:00:00.000Z'),
      endAt: new Date('2026-06-15T10:00:00.000Z'),
      recurrence: null,
      recurrenceDays: null,
    })
    primeSelect([anchor], [anchor])
    const result = await updateSeries({
      taskId: VALID_ID,
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      recurrenceCount: 1,
    })
    // The stamp is the first update; capture its fresh group id.
    const stampGroupId = setArgs()[0]!.recurrenceGroupId
    expect(stampGroupId).toBeTruthy()

    const rows = insertedRows()
    expect(rows.map((r) => r.startAt.toISOString())).toEqual([
      '2026-06-15T09:00:00.000Z', // anchor-week Mon
      '2026-06-16T09:00:00.000Z', // anchor-week Tue
    ])
    for (const r of rows) {
      expect(r.recurrenceGroupId).toBe(stampGroupId)
      expect(r.recurrenceDays).toEqual(['Mon', 'Tue'])
    }
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ data: { id: 'new-1' } })
  })

  it('materializes a field-only edit: stamps a group id and propagates the shared field, no delete/insert', async () => {
    const anchor = row({
      recurrenceGroupId: null,
      recurrence: null,
      recurrenceDays: null,
      status: 'completed',
    })
    primeSelect([anchor], [{ ...anchor, recurrenceGroupId: 'stamped' }])
    await updateSeries({ taskId: VALID_ID, title: 'Solo' })
    // Two updates: the group-id stamp, then the shared-field propagation.
    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(setArgs()[0]!.recurrenceGroupId).toBeTruthy()
    expect(setArgs()[1]!.title).toBe('Solo')
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('updateSeries — shared-field edits (no pattern change)', () => {
  it('propagates a title edit to every row via a single group UPDATE', async () => {
    primeSelect([row()], [row(), row({ id: 'task-2' })])
    await updateSeries({ taskId: VALID_ID, title: 'Renamed' })
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(setArgs()[0]!.title).toBe('Renamed')
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('propagates color, location and description edits to the group', async () => {
    primeSelect([row()], [row()])
    await updateSeries({
      taskId: VALID_ID,
      color: 'violet',
      location: 'Gym',
      description: 'legs',
    })
    expect(setArgs()[0]!.color).toBe('violet')
  })

  it('handles a group whose rows carry no startAt (series-start fallback)', async () => {
    const noStart = row({ startAt: null, endAt: null })
    primeSelect([noStart], [noStart])
    const result = await updateSeries({ taskId: VALID_ID, title: 'x' })
    expect(result).toMatchObject({ data: { id: 'task-1' } })
  })

  it('rewrites time-of-day per row, keeping each row own date, cross-midnight safe', async () => {
    primeSelect(
      [row()],
      [
        row({ id: 'a', startAt: new Date('2026-05-11T09:00:00.000Z') }),
        row({ id: 'b', startAt: new Date('2026-05-18T09:00:00.000Z') }),
      ],
    )
    await updateSeries({
      taskId: VALID_ID,
      startAt: '2026-05-11T22:00:00.000Z',
      endAt: '2026-05-12T01:00:00.000Z', // 3h duration, crosses midnight
    })
    expect(mockUpdate).toHaveBeenCalledTimes(2)
    const sets = setArgs()
    expect(sets[0]!.startAt!.toISOString()).toBe('2026-05-11T22:00:00.000Z')
    expect(sets[0]!.endAt!.toISOString()).toBe('2026-05-12T01:00:00.000Z')
    expect(sets[1]!.startAt!.toISOString()).toBe('2026-05-18T22:00:00.000Z')
    expect(sets[1]!.endAt!.toISOString()).toBe('2026-05-19T01:00:00.000Z')
  })

  it('time edit with no endAt keeps the anchor existing duration', async () => {
    // Anchor duration is 1h (09:00 → 10:00); a 14:00 start with no endAt → 15:00.
    primeSelect([row()], [row({ id: 'a', startAt: new Date('2026-05-11T09:00:00.000Z') })])
    await updateSeries({ taskId: VALID_ID, startAt: '2026-05-11T14:00:00.000Z' })
    const sets = setArgs()
    expect(sets[0]!.startAt!.toISOString()).toBe('2026-05-11T14:00:00.000Z')
    expect(sets[0]!.endAt!.toISOString()).toBe('2026-05-11T15:00:00.000Z')
  })

  it('time edit with no endAt and a null-duration anchor leaves each row endAt null', async () => {
    const anchor = row({ endAt: null })
    primeSelect(
      [anchor],
      [row({ id: 'a', startAt: new Date('2026-05-11T09:00:00.000Z'), endAt: null })],
    )
    await updateSeries({ taskId: VALID_ID, startAt: '2026-05-11T14:00:00.000Z' })
    expect(setArgs()[0]!.endAt).toBeNull()
  })

  it('time edit with an explicit null endAt clears each row endAt', async () => {
    primeSelect([row()], [row({ id: 'a', startAt: new Date('2026-05-11T09:00:00.000Z') })])
    await updateSeries({ taskId: VALID_ID, startAt: '2026-05-11T14:00:00.000Z', endAt: null })
    expect(setArgs()[0]!.endAt).toBeNull()
  })

  it('time edit skips the time rewrite on a row with a null startAt (shared fields only)', async () => {
    primeSelect(
      [row()],
      [
        row({ id: 'a', startAt: new Date('2026-05-11T09:00:00.000Z') }),
        row({ id: 'b', startAt: null, title: 'Run' }),
      ],
    )
    await updateSeries({ taskId: VALID_ID, title: 'Timed', startAt: '2026-05-11T14:00:00.000Z' })
    const sets = setArgs()
    expect(sets[0]!.startAt).toBeInstanceOf(Date) // dated row rewritten
    expect(sets[1]!.startAt).toBeUndefined() // null-date row: no time rewrite
    expect(sets[1]!.title).toBe('Timed') // but shared field still applied
  })

  it('clears the pattern (recurrence: null): rows stay grouped, nothing deleted or regenerated', async () => {
    primeSelect([row()], [row(), row({ id: 'task-2' })])
    await updateSeries({ taskId: VALID_ID, recurrence: null })
    const sets = setArgs()
    expect(sets[0]!.recurrence).toBeNull()
    expect(sets[0]!.recurrenceDays).toBeNull()
    expect(sets[0]!.recurrenceCount).toBeNull()
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('is idempotent: re-sending the identical pattern does not delete or regenerate', async () => {
    primeSelect(
      [row({ recurrenceDays: ['Mon', 'Tue'], recurrenceCount: 2 })],
      [row({ recurrenceDays: ['Mon', 'Tue'], recurrenceCount: 2 })],
    )
    await updateSeries({
      taskId: VALID_ID,
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      recurrenceCount: 2,
    })
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('treats a reordered but equal day-set as no pattern change (order-insensitive)', async () => {
    primeSelect(
      [row({ recurrenceDays: ['Mon', 'Tue'] })],
      [row({ recurrenceDays: ['Mon', 'Tue'] })],
    )
    await updateSeries({ taskId: VALID_ID, recurrence: 'weekly', recurrenceDays: ['Tue', 'Mon'] })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns Not found when the group UPDATE matches no row', async () => {
    mockReturningUpdate.mockResolvedValueOnce([])
    primeSelect([row()], [row()])
    const result = await updateSeries({ taskId: VALID_ID, title: 'x' })
    expect(result).toMatchObject({ error: 'Not found' })
  })

  it('falls back to the first updated row when the anchor id is absent from the returning set', async () => {
    mockReturningUpdate.mockResolvedValueOnce([{ id: 'other', title: 'x', type: 'task' }])
    primeSelect([row()], [row()])
    const result = await updateSeries({ taskId: VALID_ID, title: 'x' })
    expect(result).toMatchObject({ data: { id: 'other' } })
  })
})

describe('updateSeries — pattern change (regenerate)', () => {
  it('deletes ALL pending rows (past and future, no date filter) and keeps completed survivors with updated shared fields', async () => {
    const anchor = row({
      id: 'task-1',
      startAt: new Date('2026-05-04T09:00:00.000Z'),
      status: 'pending',
    })
    const completed = row({
      id: 'done',
      startAt: new Date('2026-05-11T09:00:00.000Z'),
      status: 'completed',
    })
    const futurePending = row({
      id: 'fut',
      startAt: new Date('2026-05-25T09:00:00.000Z'),
      status: 'pending',
    })
    primeSelect([anchor], [anchor, completed, futurePending])
    await updateSeries({
      taskId: VALID_ID,
      title: 'Renamed',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      recurrenceCount: 2,
    })

    // Delete predicate: group + user + pending, with NO startAt > now clause.
    expect(mockWhereDelete.mock.calls[0]![0]).toEqual({
      op: 'and',
      args: [
        { op: 'eq', col: 'tasks.recurrenceGroupId', val: 'grp-1' },
        { op: 'eq', col: 'tasks.userId', val: 'user-123' },
        { op: 'eq', col: 'tasks.status', val: 'pending' },
      ],
    })

    // seriesStart = min(startAt) = 2026-05-04 (its week Sunday 2026-05-03); count 2
    // weeks. Mon/Tue slots: 05-04, 05-05, 05-11, 05-12 — 05-11 held by the
    // completed survivor is deduped away.
    const rows = insertedRows()
    expect(rows.map((r) => r.startAt.toISOString())).toEqual([
      '2026-05-04T09:00:00.000Z',
      '2026-05-05T09:00:00.000Z',
      '2026-05-12T09:00:00.000Z',
    ])
    expect(rows.every((r) => r.title === 'Renamed')).toBe(true)

    // The completed survivor is UPDATED (not deleted) with the new shared fields.
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(setArgs()[0]!.title).toBe('Renamed')
  })

  it("returns 'Not a series' for a grouped row with a null startAt on a pattern change", async () => {
    const noStart = row({ startAt: null, endAt: null, recurrence: 'daily' })
    primeSelect([noStart], [noStart])
    const result = await updateSeries({
      taskId: VALID_ID,
      recurrence: 'weekly',
      recurrenceDays: ['Mon'],
      recurrenceCount: 1,
    })
    expect(result).toMatchObject({ error: 'Not a series' })
  })

  it('regenerates an interval (daily counted) series, never carrying day tokens', async () => {
    const anchor = row({
      recurrence: 'weekly',
      recurrenceDays: ['Mon'],
      startAt: new Date('2026-05-11T09:00:00.000Z'),
      status: 'pending',
    })
    primeSelect([anchor], [anchor])
    await updateSeries({ taskId: VALID_ID, recurrence: 'daily', recurrenceCount: 3 })
    const rows = insertedRows()
    expect(rows.map((r) => r.startAt.toISOString())).toEqual([
      '2026-05-11T09:00:00.000Z',
      '2026-05-12T09:00:00.000Z',
      '2026-05-13T09:00:00.000Z',
    ])
    expect(rows.every((r) => r.recurrence === 'daily')).toBe(true)
    expect(rows.every((r) => r.recurrenceDays === null)).toBe(true)
    expect(rows.every((r) => r.recurrenceCount === 3)).toBe(true)
  })

  it('regenerates on a count-only change with a null day-set (both-null day comparison)', async () => {
    const anchor = row({
      recurrence: 'daily',
      recurrenceDays: null,
      recurrenceCount: 1,
      startAt: new Date('2026-05-11T09:00:00.000Z'),
      status: 'pending',
    })
    primeSelect([anchor], [anchor])
    await updateSeries({ taskId: VALID_ID, recurrence: 'daily', recurrenceCount: 2 })
    const rows = insertedRows()
    expect(rows.map((r) => r.startAt.toISOString())).toEqual([
      '2026-05-11T09:00:00.000Z',
      '2026-05-12T09:00:00.000Z',
    ])
  })

  it('regenerates when a day-set is added to a previously day-less pattern (one-null comparison)', async () => {
    const anchor = row({
      recurrence: 'weekly',
      recurrenceDays: null,
      startAt: new Date('2026-05-11T09:00:00.000Z'),
      status: 'pending',
    })
    primeSelect([anchor], [anchor])
    await updateSeries({
      taskId: VALID_ID,
      recurrence: 'weekly',
      recurrenceDays: ['Mon'],
      recurrenceCount: 1,
    })
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(insertedRows()[0]!.recurrenceDays).toEqual(['Mon'])
  })

  it("rewrites survivors' time-of-day when the pattern edit also carries a time change", async () => {
    const anchor = row({
      startAt: new Date('2026-05-11T09:00:00.000Z'),
      status: 'pending',
    })
    const completed = row({
      id: 'done',
      startAt: new Date('2026-05-11T09:00:00.000Z'),
      status: 'completed',
    })
    primeSelect([anchor], [anchor, completed])
    await updateSeries({
      taskId: VALID_ID,
      recurrence: 'daily',
      recurrenceCount: 1,
      startAt: '2026-05-11T15:00:00.000Z',
      endAt: '2026-05-11T16:00:00.000Z',
    })
    // Survivor keeps its own date but takes the new 15:00 time-of-day.
    expect(setArgs()[0]!.startAt!.toISOString()).toBe('2026-05-11T15:00:00.000Z')
    expect(setArgs()[0]!.endAt!.toISOString()).toBe('2026-05-11T16:00:00.000Z')
  })

  it('returns Insert failed when the regenerate insert returns no rows', async () => {
    const anchor = row({ startAt: new Date('2026-05-11T09:00:00.000Z'), status: 'pending' })
    primeSelect([anchor], [anchor])
    mockReturningInsert.mockResolvedValueOnce([])
    const result = await updateSeries({
      taskId: VALID_ID,
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      recurrenceCount: 1,
    })
    expect(result).toMatchObject({ error: 'Insert failed' })
  })

  it('returns a surviving row when every generated slot is deduped away (no insert)', async () => {
    const anchor = row({ startAt: new Date('2026-05-11T09:00:00.000Z'), status: 'pending' })
    const completed = row({
      id: 'done',
      startAt: new Date('2026-05-11T09:00:00.000Z'),
      status: 'completed',
    })
    // Single-week Monday-only pattern; the only slot (05-11 09:00) is the
    // completed survivor's slot → deduped → nothing to insert.
    primeSelect([anchor], [anchor, completed])
    mockReturningUpdate.mockResolvedValueOnce([{ id: 'done', title: 'Run', type: 'task' }])
    const result = await updateSeries({
      taskId: VALID_ID,
      recurrence: 'weekly',
      recurrenceDays: ['Mon'],
      recurrenceCount: 1,
    })
    expect(mockInsert).not.toHaveBeenCalled()
    expect(result).toMatchObject({ data: { id: 'done' } })
  })

  it('falls back to the in-memory anchor when nothing is generated and no survivors remain', async () => {
    // Open-ended daily whose anchor sits beyond the 8-week horizon → the interval
    // walker emits zero rows; the sole (pending) row is deleted → no survivors.
    const farFuture = new Date('2026-08-31T09:00:00.000Z') // > now + 8 weeks
    const anchor = row({
      recurrence: 'weekly',
      recurrenceDays: null,
      recurrenceCount: null,
      startAt: farFuture,
      endAt: null,
      status: 'pending',
    })
    primeSelect([anchor], [anchor])
    const result = await updateSeries({ taskId: VALID_ID, recurrence: 'daily' })
    expect(mockInsert).not.toHaveBeenCalled()
    expect(result).toMatchObject({ data: { id: 'task-1', recurrenceGroupId: 'grp-1' } })
  })
})

describe('extendSeries', () => {
  it('returns Unauthorized with zero DB reads/writes when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await extendSeries()
    expect(result).toMatchObject({ error: 'Unauthorized' })
    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('builds the selection predicate and ignores rows that cannot be extended (defensive)', async () => {
    mockSelectWhere.mockReturnValueOnce(
      Promise.resolve([
        // A row with no group id at all — should never be grouped.
        row({ recurrenceGroupId: null, startAt: null }),
        // A lone row in its own group with no startAt — group has nothing dated.
        row({ id: 'no-start', recurrenceGroupId: 'grp-nostart', startAt: null, endAt: null }),
        // A group whose (only) row carries an unsupported recurrence value.
        row({
          id: 'bad-recurrence',
          recurrenceGroupId: 'grp-bad',
          recurrence: 'yearly',
          startAt: new Date('2026-05-18T09:00:00.000Z'),
        }),
      ]),
    )

    const result = await extendSeries()

    expect(vi.mocked(eq).mock.calls).toContainEqual(['tasks.userId', 'user-123'])
    expect(vi.mocked(isNotNull).mock.calls).toContainEqual(['tasks.recurrenceGroupId'])
    expect(vi.mocked(isNull).mock.calls).toContainEqual(['tasks.recurrenceCount'])
    expect(vi.mocked(inArray).mock.calls).toContainEqual([
      'tasks.recurrence',
      SUPPORTED_RECURRENCES,
    ])
    expect(mockInsert).not.toHaveBeenCalled()
    expect(result).toEqual({ data: { extended: 0 } })
  })

  it('extends an open-ended group below the threshold up to the 8-week horizon, and skips a group at/above it', async () => {
    // grp-A: maxStart is 2026-05-18T09:00, well inside now (Mon 2026-05-18) + 4
    // weeks — extends. Monthly open-ended steps from maxStart; only 2026-06-18
    // lands inside the 8-week horizon window (2026-07-13 cutoff).
    const groupA = row({
      id: 'a-max',
      recurrenceGroupId: 'grp-A',
      recurrence: 'monthly',
      recurrenceDays: null,
      recurrenceCount: null,
      startAt: new Date('2026-05-18T09:00:00.000Z'),
      endAt: new Date('2026-05-18T10:00:00.000Z'),
      color: 'violet',
      location: 'Gym',
      description: 'legs',
    })
    // An older row in the SAME group, listed after the max — exercises the
    // reduce's "existing max wins" branch (not just "new max found").
    const groupAOlder = row({
      id: 'a-older',
      recurrenceGroupId: 'grp-A',
      recurrence: 'monthly',
      recurrenceDays: null,
      recurrenceCount: null,
      startAt: new Date('2026-04-18T09:00:00.000Z'),
      endAt: new Date('2026-04-18T10:00:00.000Z'),
    })
    // grp-B: maxStart is already at/beyond the 4-week threshold — untouched.
    const groupB = row({
      id: 'b-max',
      recurrenceGroupId: 'grp-B',
      recurrence: 'weekly',
      recurrenceDays: null,
      recurrenceCount: null,
      startAt: new Date('2026-06-20T09:00:00.000Z'),
      endAt: new Date('2026-06-20T10:00:00.000Z'),
    })
    mockSelectWhere.mockReturnValueOnce(Promise.resolve([groupA, groupAOlder, groupB]))

    const result = await extendSeries()

    expect(mockInsert).toHaveBeenCalledTimes(1)
    const rows = insertedRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.startAt.toISOString()).toBe('2026-06-18T09:00:00.000Z')
    expect(rows[0]!.recurrenceGroupId).toBe('grp-A')
    expect(rows[0]!.color).toBe('violet')
    expect(result).toEqual({ data: { extended: 1 } })
  })

  it('dedupes existing slots and never inserts a slot at or before the group max startAt', async () => {
    // Same group, two existing rows: Monday and Wednesday of the week containing
    // the group's max startAt (Wednesday). Both must be excluded from the
    // generated top-up — Monday via existingSlots, Wednesday via existingSlots
    // AND notBefore (it IS the max).
    const monday = row({
      id: 'mon',
      recurrenceGroupId: 'grp-1',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Wed'],
      recurrenceCount: null,
      startAt: new Date('2026-05-11T09:00:00.000Z'),
      endAt: new Date('2026-05-11T10:00:00.000Z'),
    })
    const wednesday = row({
      id: 'wed',
      recurrenceGroupId: 'grp-1',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Wed'],
      recurrenceCount: null,
      startAt: new Date('2026-05-13T09:00:00.000Z'),
      endAt: new Date('2026-05-13T10:00:00.000Z'),
    })
    mockSelectWhere.mockReturnValueOnce(Promise.resolve([monday, wednesday]))

    await extendSeries()

    const rows = insertedRows()
    const isos = rows.map((r) => r.startAt.toISOString())
    expect(isos).not.toContain('2026-05-11T09:00:00.000Z')
    expect(isos).not.toContain('2026-05-13T09:00:00.000Z')
    expect(isos.slice(0, 2)).toEqual(['2026-05-18T09:00:00.000Z', '2026-05-20T09:00:00.000Z'])
    expect(isos.every((iso) => new Date(iso).getTime() > wednesday.startAt!.getTime())).toBe(true)
  })
})

describe('safeExtendSeries', () => {
  it('resolves without throwing and does not report to Sentry on success', async () => {
    mockSelectWhere.mockReturnValueOnce(Promise.resolve([]))
    await expect(safeExtendSeries()).resolves.toBeUndefined()
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('swallows a thrown error and reports it to Sentry instead of throwing', async () => {
    const dbError = new Error('db unreachable')
    mockSelectWhere.mockImplementationOnce(() => {
      throw dbError
    })
    await expect(safeExtendSeries()).resolves.toBeUndefined()
    expect(Sentry.captureException).toHaveBeenCalledWith(dbError)
  })
})
