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
  eventSeries: {
    activityId: 'eventSeries.activityId',
    userId: 'eventSeries.userId',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  gt: vi.fn((col: unknown, val: unknown) => ({ op: 'gt', col, val })),
}))

import { createActivity, updateActivity, deleteActivity } from '@/server/actions/activities'
import { revalidatePath } from 'next/cache'
import { activities, events, eventSeries } from '@/db/schema'
import { eq, gt } from 'drizzle-orm'

const VALID_ID = '550e8400-e29b-41d4-a716-446655440000'

// `schedule` simulates a legacy client payload carrying the pre-0022 field —
// createActivitySchema strips unknown keys, so it never reaches the insert.
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

  it('validates and inserts', async () => {
    const inserted = currentRow({ id: 'act-new' })
    mockInsertReturning.mockResolvedValueOnce([inserted])

    const result = await createActivity(VALID_CREATE_INPUT)

    expect(mockInsert).toHaveBeenCalledWith(activities)
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123', title: 'Gym' }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/calendar')
    expect(revalidatePath).toHaveBeenCalledWith('/activities')
    expect(result).toEqual({ data: inserted })
  })

  it('returns Insert failed when the insert yields no row', async () => {
    mockInsertReturning.mockResolvedValueOnce([])

    const result = await createActivity(VALID_CREATE_INPUT)

    expect(result).toEqual({ error: 'Insert failed' })
  })

  it('accepts a metadata-only input with no schedule (A5)', async () => {
    const result = await createActivity({
      title: 'Gym',
      minDurationMin: 30,
      maxDurationMin: 60,
      weeklyTargetSessions: 3,
    })

    expect(result).toHaveProperty('data')
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123', title: 'Gym' }),
    )
  })

  it('strips a legacy schedule/timeZone payload key and never writes it (columns dropped, migration 0022)', async () => {
    await createActivity({ ...VALID_CREATE_INPUT, timeZone: 'America/New_York' })

    const insertArg = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>
    expect(insertArg).not.toHaveProperty('schedule')
    expect(insertArg).not.toHaveProperty('timeZone')
  })
})

describe('updateActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateReturning.mockResolvedValue([currentRow()])
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

  it('ignores a schedule-only edit — schedule is never written (A5 metadata-only)', async () => {
    // A slot 90m wide would have been rejected against a [30,60] bound before A5;
    // now schedule is optional-and-ignored, so the edit succeeds and writes no
    // schedule at all.
    mockSelectLimit.mockResolvedValueOnce([currentRow({ minDurationMin: 30, maxDurationMin: 60 })])
    mockUpdateReturning.mockResolvedValueOnce([currentRow()])

    const result = await updateActivity({
      id: VALID_ID,
      schedule: [{ day: 0, startMinutes: 0, durationMin: 90 }],
    })

    expect(result).toHaveProperty('data')
    const setArg = mockUpdateSet.mock.calls[0]![0] as Record<string, unknown>
    expect(setArg).not.toHaveProperty('schedule')
  })

  it('strips a legacy schedule/timeZone payload key and never writes it (columns dropped, migration 0022)', async () => {
    mockSelectLimit.mockResolvedValueOnce([currentRow()])
    mockUpdateReturning.mockResolvedValueOnce([currentRow()])

    await updateActivity({
      id: VALID_ID,
      title: 'New',
      timeZone: 'America/New_York',
      schedule: [],
    })

    const setArg = mockUpdateSet.mock.calls[0]![0] as Record<string, unknown>
    expect(setArg).not.toHaveProperty('schedule')
    expect(setArg).not.toHaveProperty('timeZone')
  })

  it('fetch-merge-revalidate: rejects a partial edit whose merged [min,max] inverts', async () => {
    // Current [30,60]; a min-only edit to 90 inverts min > max post-merge, so the
    // full-object re-validation fails and no update runs.
    mockSelectLimit.mockResolvedValueOnce([currentRow({ minDurationMin: 30, maxDurationMin: 60 })])

    const result = await updateActivity({ id: VALID_ID, minDurationMin: 90 })

    expect(result).toHaveProperty('error')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('a legacy schedule payload key is stripped and never touches generatedThrough (columns dropped, migration 0022; generation is series-driven, A3)', async () => {
    const existing = currentRow()
    mockSelectLimit.mockResolvedValueOnce([existing])
    const newSchedule = [{ day: 2, startMinutes: 600, durationMin: 45 }]
    const updatedRow = currentRow()
    mockUpdateReturning.mockResolvedValueOnce([updatedRow])

    const result = await updateActivity({ id: VALID_ID, schedule: newSchedule })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ generatedThrough: expect.anything() }),
    )
    expect(result).toEqual({ data: updatedRow })
  })

  it('a legacy timeZone payload key is stripped and also does not touch generatedThrough (column dropped, migration 0022)', async () => {
    const existing = currentRow()
    mockSelectLimit.mockResolvedValueOnce([existing])
    mockUpdateReturning.mockResolvedValueOnce([currentRow()])

    await updateActivity({ id: VALID_ID, timeZone: 'America/New_York' })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ generatedThrough: expect.anything() }),
    )
  })

  it('returns Not found when the update touches no row', async () => {
    mockSelectLimit.mockResolvedValueOnce([currentRow()])
    mockUpdateReturning.mockResolvedValueOnce([])

    const result = await updateActivity({ id: VALID_ID, title: 'New' })

    expect(result).toEqual({ error: 'Not found' })
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

  it('deletes child series, then future pending children, then the activity, and revalidates', async () => {
    const result = await deleteActivity({ id: VALID_ID })

    expect(mockDelete).toHaveBeenNthCalledWith(1, eventSeries)
    expect(mockDelete).toHaveBeenNthCalledWith(2, events)
    expect(mockDelete).toHaveBeenNthCalledWith(3, activities)
    expect(vi.mocked(gt).mock.calls).toContainEqual(['events.startAt', expect.any(Date)])
    expect(revalidatePath).toHaveBeenCalledWith('/calendar')
    expect(revalidatePath).toHaveBeenCalledWith('/activities')
    expect(result).toEqual({ data: { success: true } })
  })

  it('scopes the child-series delete by both activityId and userId', async () => {
    await deleteActivity({ id: VALID_ID })

    expect(vi.mocked(eq).mock.calls).toContainEqual(['eventSeries.activityId', VALID_ID])
    expect(vi.mocked(eq).mock.calls).toContainEqual(['eventSeries.userId', 'user-123'])
  })

  it('returns Not found when the activity does not belong to the user', async () => {
    mockDeleteReturning.mockResolvedValueOnce([])

    const result = await deleteActivity({ id: VALID_ID })

    expect(result).toEqual({ error: 'Not found' })
  })
})
