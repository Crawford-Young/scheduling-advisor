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

const mockGenerateEventsForSeries = vi.hoisted(() => vi.fn().mockResolvedValue(0))

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
    seriesId: 'events.seriesId',
    status: 'events.status',
    startAt: 'events.startAt',
  },
  eventSeries: {
    id: 'eventSeries.id',
    userId: 'eventSeries.userId',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  gt: vi.fn((col: unknown, val: unknown) => ({ op: 'gt', col, val })),
}))

vi.mock('@/server/generation', () => ({
  generateEventsForSeries: mockGenerateEventsForSeries,
}))

import { createSeries, updateSeries, deleteSeries } from '@/server/actions/series'
import { revalidatePath } from 'next/cache'
import { events, eventSeries } from '@/db/schema'
import { eq, gt } from 'drizzle-orm'

const VALID_ID = '550e8400-e29b-41d4-a716-446655440000'
const ACTIVITY_ID = '660e8400-e29b-41d4-a716-446655440001'
const OTHER_SERIES_ID = '770e8400-e29b-41d4-a716-446655440002'

const VALID_WEEKLY_CREATE = {
  title: 'Standup',
  freq: 'weekly' as const,
  weekdays: [1, 3, 5],
  startMinutes: 540,
  durationMin: 30,
}

function seriesRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VALID_ID,
    userId: 'user-123',
    activityId: null,
    title: 'Standup',
    description: null,
    location: null,
    color: null,
    freq: 'weekly',
    weekdays: [1, 3, 5],
    dayOfMonth: null,
    nthOrdinal: null,
    nthWeekday: null,
    month: null,
    startMinutes: 540,
    durationMin: 30,
    timeZone: null,
    until: null,
    generatedThrough: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('module export shape', () => {
  it('every export from series is a function (use server contract)', async () => {
    const mod = await import('@/server/actions/series')
    for (const [name, value] of Object.entries(mod)) {
      expect(typeof value, `export "${name}" must be a function`).toBe('function')
    }
  })
})

describe('createSeries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsertReturning.mockResolvedValue([seriesRow()])
    mockGenerateEventsForSeries.mockResolvedValue(0)
    // Default: any activityId ownership check resolves "owned" — individual
    // tests override with mockResolvedValueOnce([]) to simulate a miss.
    mockSelectLimit.mockResolvedValue([{ id: ACTIVITY_ID }])
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await createSeries(VALID_WEEKLY_CREATE)

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await createSeries(VALID_WEEKLY_CREATE)

    expect(result).toEqual({ error: 'Too many requests' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects invalid input and does not insert', async () => {
    const result = await createSeries({ title: '' })

    expect(result).toHaveProperty('error')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects a weekly series missing weekdays', async () => {
    const result = await createSeries({
      title: 'Bad',
      freq: 'weekly',
      startMinutes: 540,
      durationMin: 30,
    })

    expect(result).toHaveProperty('error')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('validates, inserts, and generates (no anchor — generatedThrough null)', async () => {
    const inserted = seriesRow({ id: 'series-new' })
    mockInsertReturning.mockResolvedValueOnce([inserted])

    const result = await createSeries(VALID_WEEKLY_CREATE)

    expect(mockInsert).toHaveBeenCalledWith(eventSeries)
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        title: 'Standup',
        freq: 'weekly',
        weekdays: [1, 3, 5],
        generatedThrough: null,
      }),
    )
    expect(mockGenerateEventsForSeries).toHaveBeenCalledWith(inserted, expect.any(Date))
    expect(revalidatePath).toHaveBeenCalledWith('/calendar')
    expect(revalidatePath).toHaveBeenCalledWith('/activities')
    expect(result).toEqual({ data: inserted })
  })

  it('seeds generatedThrough at exactly anchorStartAt minus 1 minute', async () => {
    const anchor = new Date('2026-09-03T13:00:00.000Z')
    const expectedMark = new Date(anchor.getTime() - 60_000)

    await createSeries({ ...VALID_WEEKLY_CREATE, anchorStartAt: anchor.toISOString() })

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ generatedThrough: expectedMark }),
    )
  })

  it('strips anchorStartAt from the inserted row (input-only, not a column)', async () => {
    const anchor = new Date('2026-09-03T13:00:00.000Z')

    await createSeries({ ...VALID_WEEKLY_CREATE, anchorStartAt: anchor.toISOString() })

    const insertedValues = mockInsertValues.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertedValues).not.toHaveProperty('anchorStartAt')
  })

  it('returns Insert failed when the insert yields no row', async () => {
    mockInsertReturning.mockResolvedValueOnce([])

    const result = await createSeries(VALID_WEEKLY_CREATE)

    expect(result).toEqual({ error: 'Insert failed' })
    expect(mockGenerateEventsForSeries).not.toHaveBeenCalled()
  })

  it('rejects a foreign activityId and does not insert', async () => {
    mockSelectLimit.mockResolvedValueOnce([])

    const result = await createSeries({ ...VALID_WEEKLY_CREATE, activityId: ACTIVITY_ID })

    expect(result).toEqual({ error: 'Activity not found' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('inserts when the activityId belongs to the caller', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ id: ACTIVITY_ID }])
    const inserted = seriesRow({ id: 'series-owned', activityId: ACTIVITY_ID })
    mockInsertReturning.mockResolvedValueOnce([inserted])

    const result = await createSeries({ ...VALID_WEEKLY_CREATE, activityId: ACTIVITY_ID })

    expect(result).toEqual({ data: inserted })
  })

  it('skips the activityId ownership check for a standalone series (no activityId)', async () => {
    await createSeries(VALID_WEEKLY_CREATE)

    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('inserts weekdays as null for a daily series (no weekdays field)', async () => {
    await createSeries({
      title: 'Standup',
      freq: 'daily',
      startMinutes: 540,
      durationMin: 30,
    })

    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({ weekdays: null }))
  })
})

describe('updateSeries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectLimit.mockResolvedValue([seriesRow()])
    mockUpdateReturning.mockResolvedValue([seriesRow()])
    mockGenerateEventsForSeries.mockResolvedValue(0)
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await updateSeries({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await updateSeries({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Too many requests' })
    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects invalid input (bad uuid) before touching the db', async () => {
    const result = await updateSeries({ id: 'not-a-uuid' })

    expect(result).toHaveProperty('error')
    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns Not found for a foreign series (ownership on update)', async () => {
    mockSelectLimit.mockResolvedValueOnce([])

    const result = await updateSeries({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Not found' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('fill-only edit (title) updates the row, does not delete events, and does not regenerate', async () => {
    const current = seriesRow()
    mockSelectLimit.mockResolvedValueOnce([current])
    mockUpdateReturning.mockResolvedValueOnce([seriesRow({ title: 'Renamed' })])

    const result = await updateSeries({ id: VALID_ID, title: 'Renamed' })

    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ title: 'Renamed' }))
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ generatedThrough: expect.anything() }),
    )
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockGenerateEventsForSeries).not.toHaveBeenCalled()
    expect(result).toEqual({ data: seriesRow({ title: 'Renamed' }) })
  })

  it('fill-only edit (activityId) also touches no events', async () => {
    const current = seriesRow()
    mockSelectLimit.mockResolvedValueOnce([current]) // current-row fetch
    mockSelectLimit.mockResolvedValueOnce([{ id: ACTIVITY_ID }]) // ownership check: owned
    mockUpdateReturning.mockResolvedValueOnce([seriesRow({ activityId: ACTIVITY_ID })])

    await updateSeries({ id: VALID_ID, activityId: ACTIVITY_ID })

    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockGenerateEventsForSeries).not.toHaveBeenCalled()
  })

  describe('activityId ownership on reattach', () => {
    it('rejects a foreign activityId and does not write', async () => {
      mockSelectLimit.mockResolvedValueOnce([seriesRow()]) // current-row fetch
      mockSelectLimit.mockResolvedValueOnce([]) // ownership check: not found

      const result = await updateSeries({ id: VALID_ID, activityId: ACTIVITY_ID })

      expect(result).toEqual({ error: 'Activity not found' })
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('allows reattaching to an activityId the caller owns', async () => {
      mockSelectLimit.mockResolvedValueOnce([seriesRow()]) // current-row fetch
      mockSelectLimit.mockResolvedValueOnce([{ id: ACTIVITY_ID }]) // ownership check: owned
      mockUpdateReturning.mockResolvedValueOnce([seriesRow({ activityId: ACTIVITY_ID })])

      const result = await updateSeries({ id: VALID_ID, activityId: ACTIVITY_ID })

      expect(result).toEqual({ data: seriesRow({ activityId: ACTIVITY_ID }) })
    })

    it('skips the ownership check when clearing activityId to null (detach)', async () => {
      mockSelectLimit.mockResolvedValueOnce([seriesRow({ activityId: ACTIVITY_ID })])
      mockUpdateReturning.mockResolvedValueOnce([seriesRow({ activityId: null })])

      const result = await updateSeries({ id: VALID_ID, activityId: null })

      expect(mockSelect).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ data: seriesRow({ activityId: null }) })
    })
  })

  it('updates every fill field + monthly day-mode rule field when all are explicitly provided', async () => {
    const current = seriesRow({ freq: 'daily', weekdays: null })
    mockSelectLimit.mockResolvedValueOnce([current]) // current-row fetch
    mockSelectLimit.mockResolvedValueOnce([{ id: ACTIVITY_ID }]) // ownership check: owned
    const fullEdit = {
      id: VALID_ID,
      title: 'Rent due',
      description: 'Pay landlord',
      location: 'Bank app',
      color: 'red',
      activityId: ACTIVITY_ID,
      freq: 'monthly' as const,
      dayOfMonth: 15,
      startMinutes: 600,
      durationMin: 15,
      timeZone: 'America/New_York',
      until: '2027-01-01T00:00:00.000Z',
    }
    mockUpdateReturning.mockResolvedValueOnce([seriesRow(fullEdit)])

    const result = await updateSeries(fullEdit)

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Rent due',
        description: 'Pay landlord',
        location: 'Bank app',
        color: 'red',
        activityId: ACTIVITY_ID,
        freq: 'monthly',
        dayOfMonth: 15,
        startMinutes: 600,
        durationMin: 15,
        timeZone: 'America/New_York',
        until: new Date('2027-01-01T00:00:00.000Z'),
      }),
    )
    expect(result).toEqual({ data: seriesRow(fullEdit) })
  })

  it('updates nthOrdinal/nthWeekday explicitly (monthly nth-weekday mode)', async () => {
    const current = seriesRow({ freq: 'daily', weekdays: null })
    mockSelectLimit.mockResolvedValueOnce([current])
    const edit = { id: VALID_ID, freq: 'monthly' as const, nthOrdinal: 2, nthWeekday: 3 }
    mockUpdateReturning.mockResolvedValueOnce([seriesRow(edit)])

    await updateSeries(edit)

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ nthOrdinal: 2, nthWeekday: 3 }),
    )
  })

  it('updates month explicitly (yearly mode)', async () => {
    const current = seriesRow({ freq: 'daily', weekdays: null })
    mockSelectLimit.mockResolvedValueOnce([current])
    const edit = { id: VALID_ID, freq: 'yearly' as const, month: 6, dayOfMonth: 15 }
    mockUpdateReturning.mockResolvedValueOnce([seriesRow(edit)])

    await updateSeries(edit)

    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ month: 6 }))
  })

  it('fill-only edit (location) on an all-null-rule-fields daily series leaves every rule field unchanged', async () => {
    const current = seriesRow({
      freq: 'daily',
      weekdays: null,
      dayOfMonth: null,
      nthOrdinal: null,
      nthWeekday: null,
      month: null,
      timeZone: null,
      until: null,
      description: null,
      location: null,
      color: null,
    })
    mockSelectLimit.mockResolvedValueOnce([current])
    mockUpdateReturning.mockResolvedValueOnce([seriesRow({ location: 'Room 2' })])

    const result = await updateSeries({ id: VALID_ID, location: 'Room 2' })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        location: 'Room 2',
        description: null,
        color: null,
        weekdays: null,
        dayOfMonth: null,
        nthOrdinal: null,
        nthWeekday: null,
        month: null,
        durationMin: current.durationMin,
        timeZone: null,
        until: null,
      }),
    )
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockGenerateEventsForSeries).not.toHaveBeenCalled()
    expect(result).toEqual({ data: seriesRow({ location: 'Room 2' }) })
  })

  it('rule edit (weekdays change) deletes future-pending-only occurrences, resets the mark, and regenerates', async () => {
    const current = seriesRow({ weekdays: [1, 3, 5] })
    mockSelectLimit.mockResolvedValueOnce([current])
    const updatedRow = seriesRow({ weekdays: [2, 4] })
    mockUpdateReturning.mockResolvedValueOnce([updatedRow])

    const result = await updateSeries({ id: VALID_ID, weekdays: [2, 4] })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ weekdays: [2, 4], generatedThrough: expect.any(Date) }),
    )
    expect(mockDelete).toHaveBeenCalledWith(events)
    expect(vi.mocked(eq).mock.calls).toContainEqual([events.seriesId, VALID_ID])
    expect(vi.mocked(eq).mock.calls).toContainEqual([events.status, 'pending'])
    expect(vi.mocked(gt).mock.calls).toContainEqual([events.startAt, expect.any(Date)])
    expect(mockGenerateEventsForSeries).toHaveBeenCalledWith(updatedRow, expect.any(Date))
    expect(result).toEqual({ data: updatedRow })
  })

  it('rule edit (freq change, daily → weekly) also deletes future-pending-only and regenerates', async () => {
    // A daily current row carries no weekday/day-of-month/nth fields, so a
    // caller switching it to weekly by supplying `weekdays` alone produces a
    // clean merge (no stale rule-field carryover to conflict with the new
    // freq's superRefine).
    const current = seriesRow({ freq: 'daily', weekdays: null })
    mockSelectLimit.mockResolvedValueOnce([current])
    const updatedRow = seriesRow({ freq: 'weekly', weekdays: [2, 4] })
    mockUpdateReturning.mockResolvedValueOnce([updatedRow])

    const result = await updateSeries({ id: VALID_ID, freq: 'weekly', weekdays: [2, 4] })

    expect(result).toEqual({ data: updatedRow })
    expect(mockDelete).toHaveBeenCalledWith(events)
    expect(mockGenerateEventsForSeries).toHaveBeenCalledWith(updatedRow, expect.any(Date))
  })

  it('rejects a merged payload missing a required new-freq field and does not write', async () => {
    const current = seriesRow({ freq: 'weekly', weekdays: [1, 3, 5] })
    mockSelectLimit.mockResolvedValueOnce([current])

    // freqChanging clears the stale `weekdays` carryover, but monthly still
    // requires a dayOfMonth or an nth-weekday pair — neither is supplied.
    const result = await updateSeries({ id: VALID_ID, freq: 'monthly' })

    expect(result).toHaveProperty('error')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  describe('freq-change merge semantics', () => {
    it('weekly → monthly with only the new-freq field succeeds (stale weekdays cleared)', async () => {
      const current = seriesRow({ freq: 'weekly', weekdays: [1, 3, 5] })
      mockSelectLimit.mockResolvedValueOnce([current])
      const updatedRow = seriesRow({ freq: 'monthly', weekdays: null, dayOfMonth: 15 })
      mockUpdateReturning.mockResolvedValueOnce([updatedRow])

      const result = await updateSeries({ id: VALID_ID, freq: 'monthly', dayOfMonth: 15 })

      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ freq: 'monthly', weekdays: null, dayOfMonth: 15 }),
      )
      expect(result).toEqual({ data: updatedRow })
    })

    it('a same-freq partial edit still merges unsupplied rule fields from the current row', async () => {
      const current = seriesRow({
        freq: 'monthly',
        weekdays: null,
        dayOfMonth: 15,
        title: 'Rent',
      })
      mockSelectLimit.mockResolvedValueOnce([current])
      const updatedRow = seriesRow({
        freq: 'monthly',
        weekdays: null,
        dayOfMonth: 15,
        title: 'Rent (updated)',
      })
      mockUpdateReturning.mockResolvedValueOnce([updatedRow])

      const result = await updateSeries({ id: VALID_ID, title: 'Rent (updated)' })

      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ dayOfMonth: 15, title: 'Rent (updated)' }),
      )
      expect(mockDelete).not.toHaveBeenCalled()
      expect(result).toEqual({ data: updatedRow })
    })

    it('a freq switch that still supplies a wrong-freq field is rejected by revalidation', async () => {
      const current = seriesRow({ freq: 'weekly', weekdays: [1, 3, 5] })
      mockSelectLimit.mockResolvedValueOnce([current])

      // daily forbids weekdays even when the caller explicitly supplies it.
      const result = await updateSeries({ id: VALID_ID, freq: 'daily', weekdays: [2, 4] })

      expect(result).toHaveProperty('error')
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  it('returns Not found when the update touches no row (race)', async () => {
    mockSelectLimit.mockResolvedValueOnce([seriesRow()])
    mockUpdateReturning.mockResolvedValueOnce([])

    const result = await updateSeries({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Not found' })
    expect(mockGenerateEventsForSeries).not.toHaveBeenCalled()
  })

  it('rule edit predicate targets only this series (other series rows survive by construction)', async () => {
    const current = seriesRow({ id: OTHER_SERIES_ID, startMinutes: 540 })
    mockSelectLimit.mockResolvedValueOnce([current])
    const updatedRow = seriesRow({ id: OTHER_SERIES_ID, startMinutes: 600 })
    mockUpdateReturning.mockResolvedValueOnce([updatedRow])

    await updateSeries({ id: OTHER_SERIES_ID, startMinutes: 600 })

    expect(vi.mocked(eq).mock.calls).toContainEqual([events.seriesId, OTHER_SERIES_ID])
    expect(vi.mocked(eq).mock.calls.some((call) => call[1] === VALID_ID)).toBe(false)
  })
})

describe('deleteSeries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteReturning.mockResolvedValue([{ id: VALID_ID }])
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await deleteSeries({ id: VALID_ID, mode: 'keep' })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await deleteSeries({ id: VALID_ID, mode: 'keep' })

    expect(result).toEqual({ error: 'Too many requests' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('rejects invalid input', async () => {
    const result = await deleteSeries({ id: 'not-a-uuid', mode: 'keep' })

    expect(result).toHaveProperty('error')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('rejects an invalid mode', async () => {
    const result = await deleteSeries({ id: VALID_ID, mode: 'bogus' })

    expect(result).toHaveProperty('error')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('mode "keep": deletes only the series row (FK SET NULL unlinks occurrences)', async () => {
    const result = await deleteSeries({ id: VALID_ID, mode: 'keep' })

    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDelete).toHaveBeenCalledWith(eventSeries)
    expect(revalidatePath).toHaveBeenCalledWith('/calendar')
    expect(revalidatePath).toHaveBeenCalledWith('/activities')
    expect(result).toEqual({ data: { success: true } })
  })

  it('mode "deleteFuture": deletes future-pending occurrences, then the series row', async () => {
    const result = await deleteSeries({ id: VALID_ID, mode: 'deleteFuture' })

    expect(mockDelete).toHaveBeenNthCalledWith(1, events)
    expect(mockDelete).toHaveBeenNthCalledWith(2, eventSeries)
    expect(vi.mocked(eq).mock.calls).toContainEqual([events.seriesId, VALID_ID])
    expect(vi.mocked(eq).mock.calls).toContainEqual([events.status, 'pending'])
    expect(vi.mocked(gt).mock.calls).toContainEqual([events.startAt, expect.any(Date)])
    expect(result).toEqual({ data: { success: true } })
  })

  it('returns Not found when the series does not belong to the user (ownership on delete)', async () => {
    mockDeleteReturning.mockResolvedValueOnce([])

    const result = await deleteSeries({ id: VALID_ID, mode: 'keep' })

    expect(result).toEqual({ error: 'Not found' })
  })
})
