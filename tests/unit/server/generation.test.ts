import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelectWhere = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockSelectFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockSelectWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockSelectFrom }))

const mockInsertValues = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockInsertValues }))

const mockUpdateWhere = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockUpdateSet = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockUpdateWhere }))
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockUpdateSet }))

vi.mock('@/db', () => ({
  db: { select: mockSelect, insert: mockInsert, update: mockUpdate },
}))

vi.mock('@/db/schema', () => ({
  eventSeries: { id: 'eventSeries.id', userId: 'eventSeries.userId' },
  events: {
    id: 'events.id',
    userId: 'events.userId',
    activityId: 'events.activityId',
    seriesId: 'events.seriesId',
    status: 'events.status',
    startAt: 'events.startAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  and: vi.fn((...conds: unknown[]) => ({ op: 'and', conds })),
  or: vi.fn((...conds: unknown[]) => ({ op: 'or', conds })),
  gte: vi.fn((col: unknown, val: unknown) => ({ op: 'gte', col, val })),
  lt: vi.fn((col: unknown, val: unknown) => ({ op: 'lt', col, val })),
}))

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn() } }))

import { generateEventsForSeries, generateEvents } from '@/server/generation'
import { events, eventSeries } from '@/db/schema'

interface SeriesRow {
  id: string
  userId: string
  activityId: string | null
  title: string
  description: string | null
  location: string | null
  color: string | null
  readonly visibility: 'public' | 'busy' | 'private'
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  weekdays: readonly number[] | null
  dayOfMonth: number | null
  nthOrdinal: number | null
  nthWeekday: number | null
  month: number | null
  startMinutes: number
  durationMin: number
  timeZone: string | null
  until: Date | null
  generatedThrough: Date | null
  createdAt: Date
  updatedAt: Date
}

function makeSeriesRow(overrides: Partial<SeriesRow> = {}): SeriesRow {
  return {
    id: 'series-1',
    userId: 'user-123',
    activityId: null,
    title: 'Gym',
    description: null,
    location: null,
    color: null,
    visibility: 'private',
    freq: 'weekly',
    weekdays: [1], // Monday
    dayOfMonth: null,
    nthOrdinal: null,
    nthWeekday: null,
    month: null,
    startMinutes: 600, // 10:00
    durationMin: 60,
    timeZone: null,
    until: null,
    generatedThrough: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('generateEventsForSeries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts seeds stamped with seriesId/activityId/status and advances generatedThrough', async () => {
    const now = new Date('2026-01-05T00:00:00.000Z') // Monday
    const series = makeSeriesRow({ id: 'series-1', activityId: 'act-1' })

    const count = await generateEventsForSeries(series, now)

    expect(count).toBeGreaterThan(0)
    expect(mockInsert).toHaveBeenCalledWith(events)
    const insertedRows = mockInsertValues.mock.calls[0]![0] as Array<Record<string, unknown>>
    expect(insertedRows[0]).toMatchObject({
      userId: 'user-123',
      seriesId: 'series-1',
      activityId: 'act-1',
      status: 'pending',
      title: 'Gym',
    })
    expect(mockUpdate).toHaveBeenCalledWith(eventSeries)
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ generatedThrough: new Date('2026-03-02T00:00:00.000Z') }),
    )
  })

  it('advances the mark even when zero seeds are due', async () => {
    const now = new Date('2026-01-05T00:00:00.000Z')
    const series = makeSeriesRow({
      // generatedThrough already at the window end — nothing new is due.
      generatedThrough: new Date('2026-03-02T00:00:00.000Z'),
    })

    const count = await generateEventsForSeries(series, now)

    expect(count).toBe(0)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ generatedThrough: new Date('2026-03-02T00:00:00.000Z') }),
    )
  })

  it('dedupes against an existing pending event matching seriesId, ignoring null-startAt rows', async () => {
    const now = new Date('2026-01-05T00:00:00.000Z') // Monday
    const series = makeSeriesRow({ id: 'series-1', activityId: null })
    mockSelectWhere.mockResolvedValueOnce([
      { startAt: new Date('2026-01-05T10:00:00.000Z') },
      { startAt: null },
    ])

    await generateEventsForSeries(series, now)

    const insertedRows = mockInsertValues.mock.calls[0]![0] as Array<Record<string, unknown>>
    const starts = insertedRows.map((r) => (r.startAt as Date).toISOString())
    expect(starts).not.toContain('2026-01-05T10:00:00.000Z')
    expect(starts.length).toBeGreaterThan(0)
  })

  it('dedupes against an existing pending event matching activityId (0021-transition belt)', async () => {
    const now = new Date('2026-01-05T00:00:00.000Z') // Monday
    const series = makeSeriesRow({ id: 'series-1', activityId: 'act-1' })
    // Activity-generated row from the pre-cutover sweep — carries no seriesId
    // but matches activityId.
    mockSelectWhere.mockResolvedValueOnce([{ startAt: new Date('2026-01-05T10:00:00.000Z') }])

    await generateEventsForSeries(series, now)

    const insertedRows = mockInsertValues.mock.calls[0]![0] as Array<Record<string, unknown>>
    const starts = insertedRows.map((r) => (r.startAt as Date).toISOString())
    expect(starts).not.toContain('2026-01-05T10:00:00.000Z')
    expect(starts.length).toBeGreaterThan(0)
  })

  it('does not resurrect a deleted occurrence once the high-water mark has passed it', async () => {
    const now = new Date('2026-01-05T00:00:00.000Z') // Monday
    const series = makeSeriesRow({
      // Mark already covers the first Monday slot — even though no pending
      // event exists for it (it was deleted), it must not regenerate.
      generatedThrough: new Date('2026-01-05T10:00:00.000Z'),
    })
    mockSelectWhere.mockResolvedValueOnce([])

    await generateEventsForSeries(series, now)

    const insertedRows =
      (mockInsertValues.mock.calls[0]?.[0] as Array<Record<string, unknown>> | undefined) ?? []
    const starts = insertedRows.map((r) => (r.startAt as Date).toISOString())
    expect(starts).not.toContain('2026-01-05T10:00:00.000Z')
  })
})

describe('generateEvents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sweeps all of a user series rows and sums seed counts', async () => {
    mockSelectWhere.mockResolvedValueOnce([
      makeSeriesRow({ id: 's1' }),
      makeSeriesRow({ id: 's2' }),
    ])

    const total = await generateEvents('user-123')

    expect(total).toBeGreaterThan(0)
    expect(mockSelectFrom).toHaveBeenNthCalledWith(1, eventSeries)
    expect(mockSelect).toHaveBeenCalled()
  })

  it('second sweep at the same instant inserts zero (idempotent)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T00:00:00.000Z'))

    const series = makeSeriesRow()
    mockSelectWhere.mockResolvedValueOnce([series])

    const first = await generateEvents('user-123')
    expect(first).toBeGreaterThan(0)

    const advancedThrough = mockUpdateSet.mock.calls[0]![0].generatedThrough as Date
    mockSelectWhere.mockResolvedValueOnce([{ ...series, generatedThrough: advancedThrough }])
    mockInsert.mockClear()

    const second = await generateEvents('user-123')

    expect(second).toBe(0)
    expect(mockInsert).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
})
