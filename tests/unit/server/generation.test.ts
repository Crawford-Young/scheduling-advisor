import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockActivitiesSelectWhere = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockActivitiesSelectFrom = vi.hoisted(() =>
  vi.fn().mockReturnValue({ where: mockActivitiesSelectWhere }),
)
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockActivitiesSelectFrom }))

const mockEventsInsertValues = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockEventsInsertValues }))

const mockActivitiesUpdateWhere = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockActivitiesUpdateSet = vi.hoisted(() =>
  vi.fn().mockReturnValue({ where: mockActivitiesUpdateWhere }),
)
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockActivitiesUpdateSet }))

vi.mock('@/db', () => ({
  db: { select: mockSelect, insert: mockInsert, update: mockUpdate },
}))

vi.mock('@/db/schema', () => ({
  activities: { id: 'activities.id', userId: 'activities.userId' },
  events: { marker: 'events-table' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  and: vi.fn((...conds: unknown[]) => ({ op: 'and', conds })),
}))

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn() } }))

import { generateEventsForActivity, generateEvents } from '@/server/generation'
import { activities, events } from '@/db/schema'

interface ActivityRow {
  id: string
  userId: string
  title: string
  color: string | null
  description: string | null
  defaultLocation: string | null
  minDurationMin: number
  maxDurationMin: number
  weeklyTargetSessions: number
  schedule: readonly { day: number; startMinutes: number; durationMin: number }[]
  timeZone: string | null
  generatedThrough: Date | null
  createdAt: Date
  updatedAt: Date
}

function makeActivityRow(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 'act-1',
    userId: 'user-123',
    title: 'Gym',
    color: null,
    description: null,
    defaultLocation: null,
    minDurationMin: 30,
    maxDurationMin: 60,
    weeklyTargetSessions: 3,
    schedule: [],
    timeZone: null,
    generatedThrough: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('generateEventsForActivity', () => {
  beforeEach(() => vi.clearAllMocks())

  it('empty schedule inserts nothing but advances generatedThrough to window end', async () => {
    const now = new Date('2026-01-05T00:00:00.000Z')
    const activity = makeActivityRow({ schedule: [] })

    const count = await generateEventsForActivity(activity, now)

    expect(count).toBe(0)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith(activities)
    expect(mockActivitiesUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ generatedThrough: new Date('2026-03-02T00:00:00.000Z') }),
    )
  })

  it('inserts seeds stamped with userId/activityId and advances generatedThrough', async () => {
    const now = new Date('2026-01-05T00:00:00.000Z') // Monday
    const activity = makeActivityRow({
      schedule: [{ day: 1, startMinutes: 600, durationMin: 60 }], // Monday 10:00
    })

    const count = await generateEventsForActivity(activity, now)

    expect(count).toBeGreaterThan(0)
    expect(mockInsert).toHaveBeenCalledWith(events)
    const insertedRows = mockEventsInsertValues.mock.calls[0]![0] as Array<Record<string, unknown>>
    expect(insertedRows[0]).toMatchObject({
      userId: 'user-123',
      activityId: 'act-1',
      title: 'Gym',
    })
    expect(mockActivitiesUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ generatedThrough: new Date('2026-03-02T00:00:00.000Z') }),
    )
  })

  it('skips slots already covered by an existing pending event (dedupe guard)', async () => {
    const now = new Date('2026-01-05T00:00:00.000Z') // Monday
    const activity = makeActivityRow({
      schedule: [{ day: 1, startMinutes: 600, durationMin: 60 }], // Monday 10:00 UTC weekly
    })
    // The events-select (first select in generateEventsForActivity) returns the
    // first Monday's pending event plus a null-startAt row (filtered out).
    mockActivitiesSelectWhere.mockResolvedValueOnce([
      { startAt: new Date('2026-01-05T10:00:00.000Z') },
      { startAt: null },
    ])

    await generateEventsForActivity(activity, now)

    const insertedRows = mockEventsInsertValues.mock.calls[0]![0] as Array<Record<string, unknown>>
    const starts = insertedRows.map((r) => (r.startAt as Date).toISOString())
    // The 2026-01-05 slot is deduped; later Mondays still generate.
    expect(starts).not.toContain('2026-01-05T10:00:00.000Z')
    expect(starts.length).toBeGreaterThan(0)
  })
})

describe('generateEvents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sums seed counts across all of a user activities', async () => {
    mockActivitiesSelectWhere.mockResolvedValueOnce([
      makeActivityRow({ id: 'a1', schedule: [{ day: 1, startMinutes: 600, durationMin: 30 }] }),
      makeActivityRow({ id: 'a2', schedule: [] }),
    ])

    const total = await generateEvents('user-123')

    expect(total).toBeGreaterThan(0)
    expect(mockSelect).toHaveBeenCalled()
  })

  it('second sweep at the same instant inserts zero (idempotent)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T00:00:00.000Z'))

    const activity = makeActivityRow({
      schedule: [{ day: 1, startMinutes: 600, durationMin: 30 }],
    })
    mockActivitiesSelectWhere.mockResolvedValueOnce([activity])

    const first = await generateEvents('user-123')
    expect(first).toBeGreaterThan(0)

    const advancedThrough = mockActivitiesUpdateSet.mock.calls[0]![0].generatedThrough as Date
    mockActivitiesSelectWhere.mockResolvedValueOnce([
      { ...activity, generatedThrough: advancedThrough },
    ])
    mockInsert.mockClear()

    const second = await generateEvents('user-123')

    expect(second).toBe(0)
    expect(mockInsert).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
})
