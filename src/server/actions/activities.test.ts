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
    activityId: 'events.activityId',
    userId: 'events.userId',
    status: 'events.status',
    startAt: 'events.startAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  gt: vi.fn((col: unknown, val: unknown) => ({ op: 'gt', col, val })),
}))

vi.mock('@/server/generation', () => ({
  generateEventsForActivity: vi.fn().mockResolvedValue(0),
}))

const mockGeocodeForSave = vi.hoisted(() => vi.fn())
vi.mock('@/server/travel', () => ({
  geocodeForSave: mockGeocodeForSave,
}))

import { createActivity, updateActivity, deleteActivity } from '@/server/actions/activities'
import { generateEventsForActivity } from '@/server/generation'
import { geocodeForSave } from '@/server/travel'
import { revalidatePath } from 'next/cache'
import { activities, events } from '@/db/schema'
import { gt } from 'drizzle-orm'

const NULL_COORDS = { locationLat: null, locationLng: null }
const REAL_COORDS = { locationLat: 40.7829, locationLng: -73.9654 }

const VALID_ID = '550e8400-e29b-41d4-a716-446655440000'

const VALID_CREATE_INPUT = {
  title: 'Gym',
  minDurationMin: 30,
  maxDurationMin: 60,
  weeklyTargetSessions: 3,
  schedule: [{ day: 1, startMinutes: 600, durationMin: 45 }],
}

function currentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VALID_ID,
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

describe('module export shape', () => {
  it('every export from activities is a function (use server contract)', async () => {
    const mod = await import('@/server/actions/activities')
    for (const [name, value] of Object.entries(mod)) {
      expect(typeof value, `export "${name}" must be a function`).toBe('function')
    }
  })
})

describe('createActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsertReturning.mockResolvedValue([currentRow()])
    mockGeocodeForSave.mockResolvedValue(NULL_COORDS)
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await createActivity(VALID_CREATE_INPUT)

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await createActivity(VALID_CREATE_INPUT)

    expect(result).toEqual({ error: 'Too many requests' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects invalid input and does not insert', async () => {
    const result = await createActivity({ title: '' })

    expect(result).toHaveProperty('error')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('validates, inserts, and generates immediately', async () => {
    const inserted = currentRow({ id: 'act-new' })
    mockInsertReturning.mockResolvedValueOnce([inserted])

    const result = await createActivity(VALID_CREATE_INPUT)

    expect(mockInsert).toHaveBeenCalledWith(activities)
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123', title: 'Gym' }),
    )
    expect(generateEventsForActivity).toHaveBeenCalledWith(inserted, expect.any(Date))
    expect(revalidatePath).toHaveBeenCalledWith('/calendar')
    expect(revalidatePath).toHaveBeenCalledWith('/activities')
    expect(result).toEqual({ data: inserted })
  })

  it('returns Insert failed and skips generation when the insert yields no row', async () => {
    mockInsertReturning.mockResolvedValueOnce([])

    const result = await createActivity(VALID_CREATE_INPUT)

    expect(result).toEqual({ error: 'Insert failed' })
    expect(generateEventsForActivity).not.toHaveBeenCalled()
  })

  describe('geocode-on-save (A4)', () => {
    it('paid user + defaultLocation → insert gets real coords, geocoded off the session id', async () => {
      mockGeocodeForSave.mockResolvedValueOnce(REAL_COORDS)

      await createActivity({ ...VALID_CREATE_INPUT, defaultLocation: 'Studio B, NYC' })

      expect(geocodeForSave).toHaveBeenCalledWith('user-123', 'Studio B, NYC')
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({ defaultLocation: 'Studio B, NYC', ...REAL_COORDS }),
      )
    })

    it('free user / geocode failure → insert gets null coords but still succeeds', async () => {
      mockGeocodeForSave.mockResolvedValueOnce(NULL_COORDS)

      await createActivity({ ...VALID_CREATE_INPUT, defaultLocation: 'Somewhere' })

      expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({ ...NULL_COORDS }))
    })
  })
})

describe('updateActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateReturning.mockResolvedValue([currentRow()])
    mockGeocodeForSave.mockResolvedValue(NULL_COORDS)
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await updateActivity({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await updateActivity({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Too many requests' })
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('rejects invalid input (bad uuid) before touching the db', async () => {
    const result = await updateActivity({ id: 'not-a-uuid' })

    expect(result).toHaveProperty('error')
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('merges every field explicitly, re-validating the full merged object', async () => {
    mockSelectLimit.mockResolvedValueOnce([currentRow()])
    const fullEdit = {
      id: VALID_ID,
      title: 'Yoga',
      color: 'purple',
      description: 'Evening flow',
      defaultLocation: 'Studio B',
      minDurationMin: 20,
      maxDurationMin: 40,
      weeklyTargetSessions: 4,
      schedule: [{ day: 3, startMinutes: 720, durationMin: 30 }],
    }
    mockUpdateReturning.mockResolvedValueOnce([currentRow(fullEdit)])

    const result = await updateActivity(fullEdit)

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Yoga',
        color: 'purple',
        description: 'Evening flow',
        defaultLocation: 'Studio B',
        minDurationMin: 20,
        maxDurationMin: 40,
        weeklyTargetSessions: 4,
      }),
    )
    expect(result).toEqual({ data: currentRow(fullEdit) })
  })

  it('returns Not found when the row does not belong to the user', async () => {
    mockSelectLimit.mockResolvedValueOnce([])

    const result = await updateActivity({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Not found' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('fetch-merge-revalidate: rejects a schedule-only edit whose slot falls outside the stored [min,max]', async () => {
    mockSelectLimit.mockResolvedValueOnce([currentRow({ minDurationMin: 30, maxDurationMin: 60 })])

    const result = await updateActivity({
      id: VALID_ID,
      schedule: [{ day: 0, startMinutes: 0, durationMin: 90 }],
    })

    expect(result).toHaveProperty('error')
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(generateEventsForActivity).not.toHaveBeenCalled()
  })

  it('a non-pattern field edit does not reset generatedThrough or regenerate', async () => {
    const generatedThrough = new Date('2026-02-01T00:00:00.000Z')
    mockSelectLimit.mockResolvedValueOnce([currentRow({ generatedThrough })])
    mockUpdateReturning.mockResolvedValueOnce([
      currentRow({ title: 'New title', generatedThrough }),
    ])

    const result = await updateActivity({ id: VALID_ID, title: 'New title' })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ generatedThrough: expect.anything() }),
    )
    expect(generateEventsForActivity).not.toHaveBeenCalled()
    expect(result).toEqual({ data: currentRow({ title: 'New title', generatedThrough }) })
  })

  it('a schedule (pattern) edit resets generatedThrough to now and regenerates inline', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T00:00:00.000Z'))

    const existing = currentRow({
      schedule: [{ day: 1, startMinutes: 600, durationMin: 45 }],
      generatedThrough: new Date('2026-03-01T00:00:00.000Z'),
    })
    mockSelectLimit.mockResolvedValueOnce([existing])
    const updatedRow = currentRow({
      schedule: [{ day: 2, startMinutes: 600, durationMin: 45 }],
      generatedThrough: new Date('2026-01-15T00:00:00.000Z'),
    })
    mockUpdateReturning.mockResolvedValueOnce([updatedRow])

    const result = await updateActivity({
      id: VALID_ID,
      schedule: [{ day: 2, startMinutes: 600, durationMin: 45 }],
    })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ generatedThrough: new Date('2026-01-15T00:00:00.000Z') }),
    )
    expect(generateEventsForActivity).toHaveBeenCalledWith(
      updatedRow,
      new Date('2026-01-15T00:00:00.000Z'),
    )
    expect(result).toEqual({ data: updatedRow })

    vi.useRealTimers()
  })

  it('a schedule length change (add a slot) is also a pattern change', async () => {
    const existing = currentRow({
      schedule: [{ day: 1, startMinutes: 600, durationMin: 45 }],
    })
    mockSelectLimit.mockResolvedValueOnce([existing])
    const newSchedule = [
      { day: 1, startMinutes: 600, durationMin: 45 },
      { day: 3, startMinutes: 600, durationMin: 45 },
    ]
    mockUpdateReturning.mockResolvedValueOnce([currentRow({ schedule: newSchedule })])

    await updateActivity({ id: VALID_ID, schedule: newSchedule })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ generatedThrough: expect.any(Date) }),
    )
    expect(generateEventsForActivity).toHaveBeenCalled()
  })

  it('a same-slot durationMin-only change is also a pattern change', async () => {
    const existing = currentRow({
      schedule: [{ day: 1, startMinutes: 600, durationMin: 45 }],
    })
    mockSelectLimit.mockResolvedValueOnce([existing])
    const newSchedule = [{ day: 1, startMinutes: 600, durationMin: 30 }]
    mockUpdateReturning.mockResolvedValueOnce([currentRow({ schedule: newSchedule })])

    await updateActivity({ id: VALID_ID, schedule: newSchedule })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ generatedThrough: expect.any(Date) }),
    )
    expect(generateEventsForActivity).toHaveBeenCalled()
  })

  it('a timeZone-only edit is also a pattern change', async () => {
    const existing = currentRow({ timeZone: null })
    mockSelectLimit.mockResolvedValueOnce([existing])
    mockUpdateReturning.mockResolvedValueOnce([currentRow({ timeZone: 'America/New_York' })])

    await updateActivity({ id: VALID_ID, timeZone: 'America/New_York' })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ generatedThrough: expect.any(Date) }),
    )
    expect(generateEventsForActivity).toHaveBeenCalled()
  })

  it('returns Not found when the update touches no row', async () => {
    mockSelectLimit.mockResolvedValueOnce([currentRow()])
    mockUpdateReturning.mockResolvedValueOnce([])

    const result = await updateActivity({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Not found' })
  })

  describe('geocode-on-save (A4) — geocode ONLY when defaultLocation changed', () => {
    it('re-geocodes when defaultLocation changes and writes the new coords', async () => {
      mockSelectLimit.mockResolvedValueOnce([currentRow({ defaultLocation: 'Old studio' })])
      mockGeocodeForSave.mockResolvedValueOnce(REAL_COORDS)
      mockUpdateReturning.mockResolvedValueOnce([currentRow({ defaultLocation: 'New studio' })])

      await updateActivity({ id: VALID_ID, defaultLocation: 'New studio' })

      expect(geocodeForSave).toHaveBeenCalledWith('user-123', 'New studio')
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ defaultLocation: 'New studio', ...REAL_COORDS }),
      )
    })

    it('does NOT geocode when defaultLocation is unchanged', async () => {
      mockSelectLimit.mockResolvedValueOnce([currentRow({ defaultLocation: 'Same studio' })])
      mockUpdateReturning.mockResolvedValueOnce([currentRow({ defaultLocation: 'Same studio' })])

      await updateActivity({ id: VALID_ID, defaultLocation: 'Same studio', title: 'Renamed' })

      expect(geocodeForSave).not.toHaveBeenCalled()
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.not.objectContaining({ locationLat: expect.anything() }),
      )
    })

    it('does NOT geocode when defaultLocation is omitted (title-only edit)', async () => {
      mockSelectLimit.mockResolvedValueOnce([currentRow({ defaultLocation: 'Kept studio' })])
      mockUpdateReturning.mockResolvedValueOnce([currentRow({ title: 'Renamed' })])

      await updateActivity({ id: VALID_ID, title: 'Renamed' })

      expect(geocodeForSave).not.toHaveBeenCalled()
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.not.objectContaining({ locationLat: expect.anything() }),
      )
    })

    it('nulls the coords when defaultLocation is cleared to null', async () => {
      mockSelectLimit.mockResolvedValueOnce([currentRow({ defaultLocation: 'Old studio' })])
      mockGeocodeForSave.mockResolvedValueOnce(NULL_COORDS)
      mockUpdateReturning.mockResolvedValueOnce([currentRow({ defaultLocation: null })])

      await updateActivity({ id: VALID_ID, defaultLocation: null })

      expect(geocodeForSave).toHaveBeenCalledWith('user-123', null)
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ defaultLocation: null, ...NULL_COORDS }),
      )
    })
  })
})

describe('deleteActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteReturning.mockResolvedValue([{ id: VALID_ID }])
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await deleteActivity({ id: VALID_ID })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await deleteActivity({ id: VALID_ID })

    expect(result).toEqual({ error: 'Too many requests' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('rejects invalid input', async () => {
    const result = await deleteActivity({ id: 'not-a-uuid' })

    expect(result).toHaveProperty('error')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('deletes only future pending children, then the activity, and revalidates', async () => {
    const result = await deleteActivity({ id: VALID_ID })

    expect(mockDelete).toHaveBeenNthCalledWith(1, events)
    expect(mockDelete).toHaveBeenNthCalledWith(2, activities)
    expect(vi.mocked(gt).mock.calls).toContainEqual(['events.startAt', expect.any(Date)])
    expect(revalidatePath).toHaveBeenCalledWith('/calendar')
    expect(revalidatePath).toHaveBeenCalledWith('/activities')
    expect(result).toEqual({ data: { success: true } })
  })

  it('returns Not found when the activity does not belong to the user', async () => {
    mockDeleteReturning.mockResolvedValueOnce([])

    const result = await deleteActivity({ id: VALID_ID })

    expect(result).toEqual({ error: 'Not found' })
  })
})
