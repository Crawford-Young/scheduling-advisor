import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsertReturning = vi.hoisted(() => vi.fn())
const mockInsertValues = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockInsertReturning }),
)
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockInsertValues }))

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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({ db: { insert: mockInsert, select: mockSelect } }))
vi.mock('@/db/schema', () => ({
  activities: { id: 'activities.id', userId: 'activities.userId' },
  events: { id: 'events.id', userId: 'events.userId' },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ op: 'inArray', col, vals })),
}))

import { createEvents } from '@/server/actions/chat-mutations'
import { revalidatePath } from 'next/cache'
import { events } from '@/db/schema'

const ACTIVITY_ID = '660e8400-e29b-41d4-a716-446655440001'

function insertedRow(id: string): Record<string, unknown> {
  return {
    id,
    userId: 'user-123',
    activityId: null,
    title: id,
    startAt: new Date('2026-06-03T12:00:00.000Z'),
    endAt: new Date('2026-06-03T13:00:00.000Z'),
    status: 'pending',
  }
}

describe('module export shape', () => {
  it('every export from chat-mutations is a function (use server contract)', async () => {
    const mod = await import('@/server/actions/chat-mutations')
    for (const [name, value] of Object.entries(mod)) {
      expect(typeof value, `export "${name}" must be a function`).toBe('function')
    }
  })
})

describe('createEvents (mass tool)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsertReturning.mockResolvedValue([insertedRow('e1')])
    // Default: any activityId referenced in a batch resolves "owned" —
    // ownership-specific tests override with mockResolvedValueOnce([]).
    mockSelectWhere.mockResolvedValue([{ id: ACTIVITY_ID }])
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await createEvents({ events: [{ title: 'A' }] })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await createEvents({ events: [{ title: 'A' }] })

    expect(result).toEqual({ error: 'Too many requests' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects an empty batch and does not insert', async () => {
    const result = await createEvents({ events: [] })

    expect(result).toHaveProperty('error')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects a batch containing an invalid event and does not insert', async () => {
    const result = await createEvents({ events: [{ title: 'ok' }, { title: '' }] })

    expect(result).toHaveProperty('error')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects a batch containing an item with endAt before startAt — refine survives z.array (A9 hardening)', async () => {
    const result = await createEvents({
      events: [
        {
          title: 'Bad time',
          startAt: '2026-06-01T19:00:00.000Z',
          endAt: '2026-06-01T18:00:00.000Z',
        },
      ],
    })

    expect(result).toHaveProperty('error')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('inserts N independent event rows in one call (no series/group linkage)', async () => {
    const inserted = [insertedRow('e1'), insertedRow('e2'), insertedRow('e3')]
    mockInsertReturning.mockResolvedValueOnce(inserted)

    const result = await createEvents({
      events: [
        {
          title: 'Mon run',
          startAt: '2026-06-01T07:00:00.000Z',
          endAt: '2026-06-01T07:30:00.000Z',
        },
        {
          title: 'Wed run',
          startAt: '2026-06-03T07:00:00.000Z',
          endAt: '2026-06-03T07:30:00.000Z',
        },
        {
          title: 'Fri run',
          startAt: '2026-06-05T07:00:00.000Z',
          endAt: '2026-06-05T07:30:00.000Z',
        },
      ],
    })

    expect(mockInsert).toHaveBeenCalledWith(events)
    const valuesArg = mockInsertValues.mock.calls[0]![0] as Array<Record<string, unknown>>
    expect(valuesArg).toHaveLength(3)
    for (const row of valuesArg) {
      expect(row.userId).toBe('user-123')
      // Independent originals — no recurrence/group linkage of any kind.
      expect(row).not.toHaveProperty('recurrenceGroupId')
      expect(row).not.toHaveProperty('recurrence')
    }
    expect(valuesArg[0]!.startAt).toEqual(new Date('2026-06-01T07:00:00.000Z'))
    expect(revalidatePath).toHaveBeenCalledWith('/calendar')
    expect(revalidatePath).toHaveBeenCalledWith('/activities')
    expect(result).toEqual({ data: inserted })
  })

  it('links each row to a provided activityId while keeping rows independent', async () => {
    await createEvents({
      events: [
        { title: 'Gym A', activityId: ACTIVITY_ID },
        { title: 'Gym B', activityId: ACTIVITY_ID },
      ],
    })

    const valuesArg = mockInsertValues.mock.calls[0]![0] as Array<Record<string, unknown>>
    expect(valuesArg.every((r) => r.activityId === ACTIVITY_ID)).toBe(true)
  })

  describe('activityId ownership (A9 hardening)', () => {
    it('skips the ownership check when no event in the batch references an activityId', async () => {
      await createEvents({ events: [{ title: 'Standalone' }] })

      expect(mockSelect).not.toHaveBeenCalled()
    })

    it('rejects the whole batch when a referenced activityId does not belong to the caller', async () => {
      mockSelectWhere.mockResolvedValueOnce([])

      const result = await createEvents({
        events: [{ title: 'Gym A', activityId: ACTIVITY_ID }],
      })

      expect(result).toEqual({ error: 'Activity not found' })
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('rejects the whole batch when only one of several referenced activityIds is unowned', async () => {
      const OTHER_ACTIVITY_ID = '770e8400-e29b-41d4-a716-446655440002'
      mockSelectWhere.mockResolvedValueOnce([{ id: ACTIVITY_ID }]) // OTHER_ACTIVITY_ID missing

      const result = await createEvents({
        events: [
          { title: 'Gym A', activityId: ACTIVITY_ID },
          { title: 'Yoga B', activityId: OTHER_ACTIVITY_ID },
        ],
      })

      expect(result).toEqual({ error: 'Activity not found' })
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('inserts when every referenced activityId belongs to the caller', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: ACTIVITY_ID }])
      const inserted = [insertedRow('e1'), insertedRow('e2')]
      mockInsertReturning.mockResolvedValueOnce(inserted)

      const result = await createEvents({
        events: [
          { title: 'Gym A', activityId: ACTIVITY_ID },
          { title: 'Gym B', activityId: ACTIVITY_ID },
        ],
      })

      expect(mockInsert).toHaveBeenCalledWith(events)
      expect(result).toEqual({ data: inserted })
    })
  })
})
