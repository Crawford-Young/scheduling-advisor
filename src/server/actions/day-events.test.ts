import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn() }))

let selectRows: Array<Record<string, unknown>> = []
vi.mock('@/db', () => {
  const where = vi.fn(() => selectRows)
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  return { db: { select } }
})

vi.mock('@/db/schema', () => ({
  events: {
    id: 'events.id',
    title: 'events.title',
    userId: 'events.userId',
    startAt: 'events.startAt',
    endAt: 'events.endAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  gte: vi.fn((col: unknown, val: unknown) => ({ op: 'gte', col, val })),
  lt: vi.fn((col: unknown, val: unknown) => ({ op: 'lt', col, val })),
}))

import { auth } from '@/auth'

describe('getEventsForDay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectRows = []
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
  })

  it('returns an empty array when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const { getEventsForDay } = await import('./day-events')
    expect(await getEventsForDay('2026-06-02')).toEqual([])
  })

  it('returns an empty array for a malformed date', async () => {
    selectRows = [{ id: 'a', title: 'x', startAt: new Date(2026, 5, 2, 9, 0), endAt: null }]
    const { getEventsForDay } = await import('./day-events')
    expect(await getEventsForDay('2026-6-2')).toEqual([])
    expect(await getEventsForDay('not-a-date')).toEqual([])
  })

  it('returns only rows whose LOCAL day of startAt matches the date', async () => {
    // Straddle local midnight: 23:30 on Jun 2 and 00:30 on Jun 3 are different
    // local days regardless of the host time zone.
    selectRows = [
      { id: 'lateJun2', title: 'Late', startAt: new Date(2026, 5, 2, 23, 30), endAt: null },
      { id: 'earlyJun3', title: 'Early', startAt: new Date(2026, 5, 3, 0, 30), endAt: null },
      {
        id: 'noonJun2',
        title: 'Noon',
        startAt: new Date(2026, 5, 2, 12, 0),
        endAt: new Date(2026, 5, 2, 13, 0),
      },
    ]
    const { getEventsForDay } = await import('./day-events')
    const result = await getEventsForDay('2026-06-02')
    expect(result.map((e) => e.id)).toEqual(['lateJun2', 'noonJun2'])
  })

  it('excludes rows without a startAt (e.g. goals with only a targetDate)', async () => {
    selectRows = [
      { id: 'goal', title: 'Goal', startAt: null, endAt: null },
      { id: 'task', title: 'Task', startAt: new Date(2026, 5, 2, 9, 0), endAt: null },
    ]
    const { getEventsForDay } = await import('./day-events')
    const result = await getEventsForDay('2026-06-02')
    expect(result.map((e) => e.id)).toEqual(['task'])
  })

  it('maps id/title/start/end, falling back end to start when endAt is null', async () => {
    const startAt = new Date(2026, 5, 2, 9, 0)
    const endAt = new Date(2026, 5, 2, 10, 30)
    selectRows = [
      { id: 'withEnd', title: 'A', startAt, endAt },
      { id: 'noEnd', title: 'B', startAt, endAt: null },
    ]
    const { getEventsForDay } = await import('./day-events')
    const result = await getEventsForDay('2026-06-02')
    expect(result).toEqual([
      { id: 'withEnd', title: 'A', start: startAt.toISOString(), end: endAt.toISOString() },
      { id: 'noEnd', title: 'B', start: startAt.toISOString(), end: startAt.toISOString() },
    ])
  })

  it('range-predicates the query with local day bounds (midnight to next midnight)', async () => {
    const { eq, gte, lt } = await import('drizzle-orm')
    const { events } = await import('@/db/schema')
    const { getEventsForDay } = await import('./day-events')

    await getEventsForDay('2026-06-02')

    expect(vi.mocked(eq)).toHaveBeenCalledWith(events.userId, 'u1')
    expect(vi.mocked(gte)).toHaveBeenCalledWith(events.startAt, new Date(2026, 5, 2))
    expect(vi.mocked(lt)).toHaveBeenCalledWith(events.startAt, new Date(2026, 5, 3))
  })
})

describe('getEventsForWeek', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectRows = []
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
  })

  it('returns an empty array when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const { getEventsForWeek } = await import('./day-events')
    expect(await getEventsForWeek('2026-06-07')).toEqual([])
  })

  it('returns an empty array for a malformed weekStartDate', async () => {
    selectRows = [{ id: 'a', title: 'x', startAt: new Date(2026, 5, 7, 9, 0), endAt: null }]
    const { getEventsForWeek } = await import('./day-events')
    expect(await getEventsForWeek('2026-6-7')).toEqual([])
    expect(await getEventsForWeek('not-a-date')).toEqual([])
  })

  it('returns all seven local days events, mapping id/title/start/end and excluding rows without a startAt', async () => {
    // '2026-06-07' is a local Sunday; one row per local day of the week, a
    // late-Saturday instant (23:30) to confirm the last local day is still
    // included, and a null-startAt row that must never reach the mapped
    // output. The week's outer bound (the following Sunday) is a DB-side
    // gte/lt predicate concern, verified separately below.
    const sun = new Date(2026, 5, 7, 9, 0)
    const mon = new Date(2026, 5, 8, 9, 0)
    const tue = new Date(2026, 5, 9, 9, 0)
    const wed = new Date(2026, 5, 10, 9, 0)
    const thu = new Date(2026, 5, 11, 9, 0)
    const fri = new Date(2026, 5, 12, 9, 0)
    const satLate = new Date(2026, 5, 13, 23, 30)
    selectRows = [
      { id: 'sun', title: 'Sun', startAt: sun, endAt: null },
      { id: 'mon', title: 'Mon', startAt: mon, endAt: null },
      { id: 'tue', title: 'Tue', startAt: tue, endAt: null },
      { id: 'wed', title: 'Wed', startAt: wed, endAt: null },
      { id: 'thu', title: 'Thu', startAt: thu, endAt: null },
      { id: 'fri', title: 'Fri', startAt: fri, endAt: null },
      { id: 'satLate', title: 'SatLate', startAt: satLate, endAt: null },
      { id: 'noStart', title: 'Goal', startAt: null, endAt: null },
    ]
    const { getEventsForWeek } = await import('./day-events')
    const result = await getEventsForWeek('2026-06-07')

    expect(result.map((e) => e.id)).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'satLate'])
    expect(result[0]).toEqual({
      id: 'sun',
      title: 'Sun',
      start: sun.toISOString(),
      end: sun.toISOString(),
    })
    // The exclusion of an instant beyond the week (e.g. the following Sunday
    // 00:30) is a DB-side gte/lt predicate concern, not a JS filter — the
    // exact bounds are asserted independently in the range-predicate test
    // below, since this mock's `where` does not evaluate its own predicate.
  })

  it('range-predicates the query using local week bounds (Sunday to next Sunday)', async () => {
    const { eq, gte, lt } = await import('drizzle-orm')
    const { events } = await import('@/db/schema')
    const { getEventsForWeek } = await import('./day-events')

    await getEventsForWeek('2026-06-07')

    expect(vi.mocked(eq)).toHaveBeenCalledWith(events.userId, 'u1')
    expect(vi.mocked(gte)).toHaveBeenCalledWith(events.startAt, new Date(2026, 5, 7))
    expect(vi.mocked(lt)).toHaveBeenCalledWith(events.startAt, new Date(2026, 5, 14))
  })

  it('floors a non-Sunday weekStartDate to its local week via localWeekBounds', async () => {
    const { gte, lt } = await import('drizzle-orm')
    const { events } = await import('@/db/schema')
    const { getEventsForWeek } = await import('./day-events')

    // 2026-06-09 is a Tuesday within the same local week as the Sunday above.
    await getEventsForWeek('2026-06-09')

    expect(vi.mocked(gte)).toHaveBeenCalledWith(events.startAt, new Date(2026, 5, 7))
    expect(vi.mocked(lt)).toHaveBeenCalledWith(events.startAt, new Date(2026, 5, 14))
  })
})
