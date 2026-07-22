import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsertReturning = vi.hoisted(() => vi.fn())
const mockInsertValues = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockInsertReturning }),
)
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockInsertValues }))

const mockSelectLimit = vi.hoisted(() => vi.fn())
const mockSelectWhere = vi.hoisted(() => vi.fn().mockReturnValue({ limit: mockSelectLimit }))
const mockSelectFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockSelectWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockSelectFrom }))

const mockUpdateReturning = vi.hoisted(() => vi.fn())
const mockUpdateWhere = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockUpdateReturning }),
)
const mockUpdateSet = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockUpdateWhere }))
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockUpdateSet }))

const mockDeleteReturning = vi.hoisted(() => vi.fn())
const mockDeleteWhere = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockDeleteReturning }),
)
const mockDelete = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockDeleteWhere }))

const mockGeocodeForSave = vi.hoisted(() => vi.fn())

vi.mock('@/server/travel', () => ({
  geocodeForSave: mockGeocodeForSave,
}))

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))

vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn() } }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/db', () => ({
  db: { insert: mockInsert, select: mockSelect, update: mockUpdate, delete: mockDelete },
}))

vi.mock('@/db/schema', () => ({
  activities: {
    id: 'activities.id',
    userId: 'activities.userId',
  },
  events: {
    id: 'events.id',
    userId: 'events.userId',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
}))

import { createEvent, updateEvent, deleteEvent } from '@/server/actions/events'
import { geocodeForSave } from '@/server/travel'
import { revalidatePath } from 'next/cache'
import { events } from '@/db/schema'
import { eq } from 'drizzle-orm'

const NULL_COORDS = { locationLat: null, locationLng: null }
const REAL_COORDS = { locationLat: 40.7829, locationLng: -73.9654 }

const VALID_ID = '550e8400-e29b-41d4-a716-446655440000'
const ACTIVITY_ID = '660e8400-e29b-41d4-a716-446655440001'

function eventRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VALID_ID,
    userId: 'user-123',
    activityId: null,
    title: 'Standalone lunch',
    description: null,
    location: null,
    startAt: new Date('2026-01-05T18:00:00.000Z'),
    endAt: new Date('2026-01-05T19:00:00.000Z'),
    allDay: false,
    status: 'pending',
    locked: false,
    color: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('module export shape', () => {
  it('every export from events is a function (use server contract)', async () => {
    const mod = await import('@/server/actions/events')
    for (const [name, value] of Object.entries(mod)) {
      expect(typeof value, `export "${name}" must be a function`).toBe('function')
    }
  })
})

describe('createEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsertReturning.mockResolvedValue([eventRow()])
    // Default: any activityId ownership check resolves "owned" — individual
    // tests override with mockResolvedValueOnce([]) to simulate a miss.
    mockSelectLimit.mockResolvedValue([{ id: ACTIVITY_ID }])
    // Default: geocode yields nulls (free user / empty text / geocode failure).
    mockGeocodeForSave.mockResolvedValue(NULL_COORDS)
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await createEvent({ title: 'Lunch' })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await createEvent({ title: 'Lunch' })

    expect(result).toEqual({ error: 'Too many requests' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects invalid input and does not insert', async () => {
    const result = await createEvent({ title: '' })

    expect(result).toHaveProperty('error')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects endAt before startAt and does not insert', async () => {
    const result = await createEvent({
      title: 'Backwards',
      startAt: '2026-07-20T19:00:00.000Z',
      endAt: '2026-07-20T18:00:00.000Z',
    })

    expect(result).toHaveProperty('error')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('validates and inserts a standalone event (no activityId, no server-side seeding)', async () => {
    const inserted = eventRow({ id: 'evt-new' })
    mockInsertReturning.mockResolvedValueOnce([inserted])

    const result = await createEvent({ title: 'Lunch' })

    expect(mockInsert).toHaveBeenCalledWith(events)
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123', title: 'Lunch', activityId: null }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/calendar')
    expect(revalidatePath).toHaveBeenCalledWith('/activities')
    expect(result).toEqual({ data: inserted })
  })

  it('skips the activityId ownership check for a standalone event (no activityId)', async () => {
    await createEvent({ title: 'Lunch' })

    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('validates and inserts an event with all optional fields provided', async () => {
    const inserted = eventRow({ id: 'evt-full' })
    mockInsertReturning.mockResolvedValueOnce([inserted])

    const fullInput = {
      title: 'Full event',
      activityId: ACTIVITY_ID,
      startAt: '2026-02-01T10:00:00.000Z',
      endAt: '2026-02-01T11:00:00.000Z',
      allDay: true,
      color: 'blue',
      location: 'Loc',
      description: 'Desc',
    }

    const result = await createEvent(fullInput)

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: ACTIVITY_ID,
        startAt: new Date('2026-02-01T10:00:00.000Z'),
        endAt: new Date('2026-02-01T11:00:00.000Z'),
        allDay: true,
        color: 'blue',
        location: 'Loc',
        description: 'Desc',
      }),
    )
    expect(result).toEqual({ data: inserted })
  })

  it('returns Insert failed when the insert yields no row', async () => {
    mockInsertReturning.mockResolvedValueOnce([])

    const result = await createEvent({ title: 'Lunch' })

    expect(result).toEqual({ error: 'Insert failed' })
  })

  it('rejects an activityId that does not belong to the caller and does not insert (A9 hardening)', async () => {
    mockSelectLimit.mockResolvedValueOnce([])

    const result = await createEvent({ title: 'Gym session', activityId: ACTIVITY_ID })

    expect(result).toEqual({ error: 'Activity not found' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('inserts when the activityId belongs to the caller (A9 hardening)', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ id: ACTIVITY_ID }])
    const inserted = eventRow({ id: 'evt-owned', activityId: ACTIVITY_ID })
    mockInsertReturning.mockResolvedValueOnce([inserted])

    const result = await createEvent({ title: 'Gym session', activityId: ACTIVITY_ID })

    expect(mockInsert).toHaveBeenCalledWith(events)
    expect(result).toEqual({ data: inserted })
  })

  describe('geocode-on-save (A4)', () => {
    it('paid user + location text → insert gets the real coords, geocoded off the session id', async () => {
      mockGeocodeForSave.mockResolvedValueOnce(REAL_COORDS)

      await createEvent({ title: 'Lunch', location: 'Central Park, NYC' })

      expect(geocodeForSave).toHaveBeenCalledWith('user-123', 'Central Park, NYC')
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({ location: 'Central Park, NYC', ...REAL_COORDS }),
      )
    })

    it('free user / geocode failure → insert gets null coords but still succeeds', async () => {
      mockGeocodeForSave.mockResolvedValueOnce(NULL_COORDS)
      const inserted = eventRow({ id: 'evt-free' })
      mockInsertReturning.mockResolvedValueOnce([inserted])

      const result = await createEvent({ title: 'Lunch', location: 'Somewhere' })

      expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({ ...NULL_COORDS }))
      expect(result).toEqual({ data: inserted })
    })

    it('no location → geocode is still called (returns nulls for empty text)', async () => {
      await createEvent({ title: 'Lunch' })

      expect(geocodeForSave).toHaveBeenCalledWith('user-123', null)
      expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({ ...NULL_COORDS }))
    })
  })
})

describe('updateEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // First select() call = the current-row fetch (fetch-merge-revalidate);
    // a second call (when activityId is being attached) = the ownership
    // check. This default satisfies both with a valid, ownable row.
    mockSelectLimit.mockResolvedValue([eventRow()])
    mockUpdateReturning.mockResolvedValue([eventRow()])
    mockGeocodeForSave.mockResolvedValue(NULL_COORDS)
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await updateEvent({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await updateEvent({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Too many requests' })
    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects invalid input (bad uuid) before touching the db', async () => {
    const result = await updateEvent({ id: 'not-a-uuid' })

    expect(result).toHaveProperty('error')
    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('updates only the provided field, leaving the rest unset', async () => {
    const result = await updateEvent({ id: VALID_ID, title: 'New title' })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New title', updatedAt: expect.any(Date) }),
    )
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: expect.anything() }),
    )
    expect(result).toEqual({ data: eventRow() })
  })

  it('updates status independently — any field including status/locked, no grouped-edit guard', async () => {
    mockUpdateReturning.mockResolvedValueOnce([eventRow({ status: 'completed' })])

    const result = await updateEvent({ id: VALID_ID, status: 'completed' })

    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }))
    expect(result).toEqual({ data: eventRow({ status: 'completed' }) })
  })

  it('updates locked independently', async () => {
    mockUpdateReturning.mockResolvedValueOnce([eventRow({ locked: true })])

    const result = await updateEvent({ id: VALID_ID, locked: true })

    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ locked: true }))
    expect(result).toEqual({ data: eventRow({ locked: true }) })
  })

  it('updates every optional field when all are provided', async () => {
    const fullEdit = {
      id: VALID_ID,
      title: 'Full edit',
      activityId: ACTIVITY_ID,
      description: 'Desc',
      location: 'Loc',
      startAt: '2026-02-01T10:00:00.000Z',
      endAt: '2026-02-01T11:00:00.000Z',
      allDay: true,
      color: 'blue',
      status: 'completed' as const,
      locked: true,
    }
    mockUpdateReturning.mockResolvedValueOnce([eventRow(fullEdit)])

    const result = await updateEvent(fullEdit)

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Full edit',
        activityId: ACTIVITY_ID,
        description: 'Desc',
        location: 'Loc',
        startAt: new Date('2026-02-01T10:00:00.000Z'),
        endAt: new Date('2026-02-01T11:00:00.000Z'),
        allDay: true,
        color: 'blue',
        status: 'completed',
        locked: true,
      }),
    )
    expect(result).toEqual({ data: eventRow(fullEdit) })
  })

  it('clears startAt to null when explicitly set to null', async () => {
    await updateEvent({ id: VALID_ID, startAt: null })

    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ startAt: null }))
  })

  it('converts a provided startAt ISO string to a Date and allows clearing endAt to null', async () => {
    await updateEvent({
      id: VALID_ID,
      startAt: '2026-02-01T10:00:00.000Z',
      endAt: null,
    })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: new Date('2026-02-01T10:00:00.000Z'),
        endAt: null,
      }),
    )
  })

  it('two-event fixture: updating one event leaves its sibling untouched (WFH-Friday case)', async () => {
    // Two independent originals (e.g. a WFH pattern's Mon + Fri rows) — editing
    // Friday's row must never reference or write Monday's row. Events have no
    // grouped-edit machinery, unlike the legacy tasks series model.
    const mondayId = '770e8400-e29b-41d4-a716-446655440002'
    const fridayId = VALID_ID
    mockUpdateReturning.mockResolvedValueOnce([eventRow({ id: fridayId, title: 'WFH (early)' })])

    const result = await updateEvent({ id: fridayId, title: 'WFH (early)' })

    expect(vi.mocked(eq).mock.calls).toContainEqual([events.id, fridayId])
    expect(vi.mocked(eq).mock.calls.some((call) => call[1] === mondayId)).toBe(false)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ data: eventRow({ id: fridayId, title: 'WFH (early)' }) })
  })

  it('returns Not found when the row does not belong to the user', async () => {
    mockSelectLimit.mockResolvedValueOnce([])

    const result = await updateEvent({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Not found' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns Not found when the update touches no row (race: deleted between fetch and write)', async () => {
    mockSelectLimit.mockResolvedValueOnce([eventRow()])
    mockUpdateReturning.mockResolvedValueOnce([])

    const result = await updateEvent({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Not found' })
  })

  it('merges over a current row with null startAt/endAt (unscheduled event) without a crash', async () => {
    mockSelectLimit.mockResolvedValueOnce([eventRow({ startAt: null, endAt: null })])
    mockUpdateReturning.mockResolvedValueOnce([
      eventRow({ startAt: null, endAt: null, title: 'Retitled' }),
    ])

    const result = await updateEvent({ id: VALID_ID, title: 'Retitled' })

    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ title: 'Retitled' }))
    expect(result).toEqual({ data: eventRow({ startAt: null, endAt: null, title: 'Retitled' }) })
  })

  describe('merge-then-validate (A9 hardening — mirrors updateActivity fetch-merge-revalidate)', () => {
    it('rejects an endAt-only edit that would invert the stored startAt', async () => {
      mockSelectLimit.mockResolvedValueOnce([
        eventRow({
          startAt: new Date('2026-01-05T19:00:00.000Z'),
          endAt: new Date('2026-01-05T20:00:00.000Z'),
        }),
      ])

      const result = await updateEvent({
        id: VALID_ID,
        endAt: '2026-01-05T18:00:00.000Z',
      })

      expect(result).toHaveProperty('error')
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('rejects a startAt-only edit that would invert the stored endAt', async () => {
      mockSelectLimit.mockResolvedValueOnce([
        eventRow({
          startAt: new Date('2026-01-05T18:00:00.000Z'),
          endAt: new Date('2026-01-05T19:00:00.000Z'),
        }),
      ])

      const result = await updateEvent({
        id: VALID_ID,
        startAt: '2026-01-05T20:00:00.000Z',
      })

      expect(result).toHaveProperty('error')
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('accepts an endAt-only edit that stays after the stored startAt', async () => {
      mockSelectLimit.mockResolvedValueOnce([
        eventRow({
          startAt: new Date('2026-01-05T18:00:00.000Z'),
          endAt: new Date('2026-01-05T19:00:00.000Z'),
        }),
      ])
      mockUpdateReturning.mockResolvedValueOnce([
        eventRow({ endAt: new Date('2026-01-05T21:00:00.000Z') }),
      ])

      const result = await updateEvent({
        id: VALID_ID,
        endAt: '2026-01-05T21:00:00.000Z',
      })

      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ endAt: new Date('2026-01-05T21:00:00.000Z') }),
      )
      expect(result).toEqual({ data: eventRow({ endAt: new Date('2026-01-05T21:00:00.000Z') }) })
    })
  })

  describe('activityId ownership (A9 hardening)', () => {
    it('rejects attaching to an activityId that does not belong to the caller', async () => {
      mockSelectLimit.mockResolvedValueOnce([eventRow()]) // current row fetch
      mockSelectLimit.mockResolvedValueOnce([]) // ownership check: not found

      const result = await updateEvent({ id: VALID_ID, activityId: ACTIVITY_ID })

      expect(result).toEqual({ error: 'Activity not found' })
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('allows attaching to an activityId the caller owns', async () => {
      mockSelectLimit.mockResolvedValueOnce([eventRow()])
      mockSelectLimit.mockResolvedValueOnce([{ id: ACTIVITY_ID }])
      mockUpdateReturning.mockResolvedValueOnce([eventRow({ activityId: ACTIVITY_ID })])

      const result = await updateEvent({ id: VALID_ID, activityId: ACTIVITY_ID })

      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ activityId: ACTIVITY_ID }),
      )
      expect(result).toEqual({ data: eventRow({ activityId: ACTIVITY_ID }) })
    })

    it('allows clearing activityId to null without an ownership check', async () => {
      mockSelectLimit.mockResolvedValueOnce([eventRow({ activityId: ACTIVITY_ID })])
      mockUpdateReturning.mockResolvedValueOnce([eventRow({ activityId: null })])

      const result = await updateEvent({ id: VALID_ID, activityId: null })

      expect(mockSelect).toHaveBeenCalledTimes(1)
      expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ activityId: null }))
      expect(result).toEqual({ data: eventRow({ activityId: null }) })
    })
  })

  describe('geocode-on-save (A4) — geocode ONLY when the location field changed', () => {
    it('re-geocodes when location changes and writes the new coords', async () => {
      mockSelectLimit.mockResolvedValueOnce([eventRow({ location: 'Old place' })])
      mockGeocodeForSave.mockResolvedValueOnce(REAL_COORDS)
      mockUpdateReturning.mockResolvedValueOnce([eventRow({ location: 'New place' })])

      await updateEvent({ id: VALID_ID, location: 'New place' })

      expect(geocodeForSave).toHaveBeenCalledWith('user-123', 'New place')
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ location: 'New place', ...REAL_COORDS }),
      )
    })

    it('does NOT geocode when the location value is unchanged (same string re-sent)', async () => {
      mockSelectLimit.mockResolvedValueOnce([eventRow({ location: 'Same place' })])
      mockUpdateReturning.mockResolvedValueOnce([eventRow({ location: 'Same place' })])

      await updateEvent({ id: VALID_ID, location: 'Same place' })

      expect(geocodeForSave).not.toHaveBeenCalled()
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.not.objectContaining({ locationLat: expect.anything() }),
      )
    })

    it('does NOT geocode when location is omitted from the payload', async () => {
      mockSelectLimit.mockResolvedValueOnce([eventRow({ location: 'Kept place' })])

      await updateEvent({ id: VALID_ID, title: 'Retitle only' })

      expect(geocodeForSave).not.toHaveBeenCalled()
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.not.objectContaining({ locationLat: expect.anything() }),
      )
    })

    it('nulls the coords when location is cleared to null', async () => {
      mockSelectLimit.mockResolvedValueOnce([eventRow({ location: 'Old place' })])
      mockGeocodeForSave.mockResolvedValueOnce(NULL_COORDS)
      mockUpdateReturning.mockResolvedValueOnce([eventRow({ location: null })])

      await updateEvent({ id: VALID_ID, location: null })

      expect(geocodeForSave).toHaveBeenCalledWith('user-123', null)
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ location: null, ...NULL_COORDS }),
      )
    })
  })
})

describe('deleteEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteReturning.mockResolvedValue([{ id: VALID_ID }])
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await deleteEvent({ id: VALID_ID })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await deleteEvent({ id: VALID_ID })

    expect(result).toEqual({ error: 'Too many requests' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('rejects invalid input', async () => {
    const result = await deleteEvent({ id: 'not-a-uuid' })

    expect(result).toHaveProperty('error')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('deletes only the target event and revalidates', async () => {
    const result = await deleteEvent({ id: VALID_ID })

    expect(mockDelete).toHaveBeenCalledWith(events)
    expect(revalidatePath).toHaveBeenCalledWith('/calendar')
    expect(revalidatePath).toHaveBeenCalledWith('/activities')
    expect(result).toEqual({ data: { success: true } })
  })

  it('returns Not found when the event does not belong to the user', async () => {
    mockDeleteReturning.mockResolvedValueOnce([])

    const result = await deleteEvent({ id: VALID_ID })

    expect(result).toEqual({ error: 'Not found' })
  })
})
