import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn() }))

let selectRows: Array<Record<string, unknown>> = []
vi.mock('@/db', () => {
  const where = vi.fn(() => selectRows)
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  return { db: { select } }
})

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
})
