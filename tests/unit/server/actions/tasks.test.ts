import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReturningInsert = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 'task-1', title: 'Run 5k', type: 'goal', status: 'pending' }]),
)
const mockOnConflict = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockValuesInsert = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturningInsert, onConflictDoNothing: mockOnConflict }),
)
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockValuesInsert }))

const mockReturningUpdate = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 'task-1', status: 'completed', type: 'task' }]),
)
const mockWhereUpdate = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturningUpdate }),
)
const mockSetUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereUpdate }))
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockSetUpdate }))

const mockReturningDelete = vi.hoisted(() => vi.fn().mockResolvedValue([{ id: 'task-1' }]))
const mockWhereDelete = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturningDelete }),
)
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
    status: 'tasks.status',
    startAt: 'tasks.startAt',
  },
  seriesSlotTombstones: {
    id: 'tombstones.id',
    userId: 'tombstones.userId',
    recurrenceGroupId: 'tombstones.recurrenceGroupId',
    slotStart: 'tombstones.slotStart',
  },
}))

// Recording stubs (not real SQL builders) so a delete-predicate test could assert
// the exact condition shape passed to `.where()`. That assertion now lives in
// series-mutations.test.ts (the series-edit action moved to
// src/server/actions/series-mutations.ts) — every test in this file is
// indifferent to these; the where()/set() mocks below return fixed values
// regardless of the condition object they receive.
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  gt: vi.fn((col: unknown, val: unknown) => ({ op: 'gt', col, val })),
}))

import { createTask, updateTask, deleteTask } from '@/server/actions/tasks'

describe('createTask', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates task with valid input', async () => {
    mockReturningInsert.mockResolvedValueOnce([
      { id: 'task-1', title: 'Run 5k', type: 'goal', status: 'pending' },
    ])
    mockValuesInsert.mockReturnValue({ returning: mockReturningInsert })
    mockInsert.mockReturnValue({ values: mockValuesInsert })
    const result = await createTask({ title: 'Run 5k', type: 'goal' })
    expect(result).toMatchObject({ data: { id: 'task-1' } })
  })

  it('creates recurring task with recurrence and targetDate', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'task-2', title: 'Meditate', type: 'task' }])
    mockValuesInsert.mockReturnValue({ returning: mockReturningInsert })
    mockInsert.mockReturnValue({ values: mockValuesInsert })
    const result = await createTask({
      title: 'Meditate',
      type: 'task',
      recurrence: 'RRULE:FREQ=DAILY',
      targetDate: new Date('2026-12-31').toISOString(),
    })
    expect(result).toMatchObject({ data: { id: 'task-2' } })
  })

  it('returns error for invalid input', async () => {
    const result = await createTask({ title: '', type: 'goal' })
    expect(result).toHaveProperty('error')
  })

  it('returns insert-failed when single insert returns empty', async () => {
    mockReturningInsert.mockResolvedValueOnce([])
    const result = await createTask({ title: 'Run 5k', type: 'goal' })
    expect(result).toMatchObject({ error: 'Insert failed' })
  })

  it('returns error when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await createTask({ title: 'Run', type: 'goal' })
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns error when rate limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const result = await createTask({ title: 'Run', type: 'goal' })
    expect(result).toMatchObject({ error: 'Too many requests' })
  })
})

describe('createTask fan-out', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates 3 daily tasks with correct startAt offsets', async () => {
    const rows = [
      {
        id: 'task-1',
        title: 'Meditate',
        type: 'task',
        startAt: new Date('2026-05-19T09:00:00.000Z'),
      },
      {
        id: 'task-2',
        title: 'Meditate',
        type: 'task',
        startAt: new Date('2026-05-20T09:00:00.000Z'),
      },
      {
        id: 'task-3',
        title: 'Meditate',
        type: 'task',
        startAt: new Date('2026-05-21T09:00:00.000Z'),
      },
    ]
    mockReturningInsert.mockResolvedValueOnce(rows)

    const result = await createTask({
      title: 'Meditate',
      type: 'task',
      recurrence: 'daily',
      startAt: '2026-05-19T09:00:00.000Z',
      endAt: '2026-05-19T10:00:00.000Z',
      recurrenceCount: 3,
    })

    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{ startAt: Date }>
    expect(insertedRows).toHaveLength(3)
    expect(insertedRows[0]!.startAt.toISOString()).toBe('2026-05-19T09:00:00.000Z')
    expect(insertedRows[1]!.startAt.toISOString()).toBe('2026-05-20T09:00:00.000Z')
    expect(insertedRows[2]!.startAt.toISOString()).toBe('2026-05-21T09:00:00.000Z')
    expect(result).toMatchObject({ data: { id: 'task-1' } })
  })

  it('creates 2 weekly tasks with correct startAt offsets', async () => {
    const rows = [
      { id: 'task-1', title: 'Run', type: 'task', startAt: new Date('2026-05-19T07:00:00.000Z') },
      { id: 'task-2', title: 'Run', type: 'task', startAt: new Date('2026-05-26T07:00:00.000Z') },
    ]
    mockReturningInsert.mockResolvedValueOnce(rows)

    await createTask({
      title: 'Run',
      type: 'task',
      recurrence: 'weekly',
      startAt: '2026-05-19T07:00:00.000Z',
      endAt: '2026-05-19T08:00:00.000Z',
      recurrenceCount: 2,
    })

    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{ startAt: Date }>
    expect(insertedRows).toHaveLength(2)
    expect(insertedRows[0]!.startAt.toISOString()).toBe('2026-05-19T07:00:00.000Z')
    expect(insertedRows[1]!.startAt.toISOString()).toBe('2026-05-26T07:00:00.000Z')
  })

  it('creates 2 monthly tasks with correct month offsets', async () => {
    const rows = [
      {
        id: 'task-1',
        title: 'Review',
        type: 'task',
        startAt: new Date('2026-05-01T09:00:00.000Z'),
      },
      {
        id: 'task-2',
        title: 'Review',
        type: 'task',
        startAt: new Date('2026-06-01T09:00:00.000Z'),
      },
    ]
    mockReturningInsert.mockResolvedValueOnce(rows)

    await createTask({
      title: 'Review',
      type: 'task',
      recurrence: 'monthly',
      startAt: '2026-05-01T09:00:00.000Z',
      endAt: '2026-05-01T10:00:00.000Z',
      recurrenceCount: 2,
    })

    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{ startAt: Date }>
    expect(insertedRows).toHaveLength(2)
    expect(insertedRows[0]!.startAt.getUTCMonth()).toBe(4) // May
    expect(insertedRows[1]!.startAt.getUTCMonth()).toBe(5) // June
  })

  it('fan-out without endAt sets null end dates (daily)', async () => {
    mockReturningInsert.mockResolvedValueOnce([
      {
        id: 'task-1',
        title: 'Daily meditation',
        type: 'task',
        startAt: new Date('2026-05-19T09:00:00.000Z'),
      },
    ])
    await createTask({
      title: 'Daily meditation',
      type: 'task',
      recurrence: 'daily',
      startAt: '2026-05-19T09:00:00.000Z',
      recurrenceCount: 2,
    })
    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{ endAt: null }>
    expect(insertedRows[0]!.endAt).toBeNull()
  })

  it('fan-out without endAt sets null end dates (weekly)', async () => {
    mockReturningInsert.mockResolvedValueOnce([
      {
        id: 'task-1',
        title: 'Weekly review',
        type: 'task',
        startAt: new Date('2026-05-19T09:00:00.000Z'),
      },
    ])
    await createTask({
      title: 'Weekly review',
      type: 'task',
      recurrence: 'weekly',
      startAt: '2026-05-19T09:00:00.000Z',
      recurrenceCount: 2,
    })
    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{ endAt: null }>
    expect(insertedRows[0]!.endAt).toBeNull()
  })

  it('fan-out without endAt sets null end dates (monthly)', async () => {
    mockReturningInsert.mockResolvedValueOnce([
      {
        id: 'task-1',
        title: 'Monthly check',
        type: 'task',
        startAt: new Date('2026-05-01T09:00:00.000Z'),
      },
    ])
    await createTask({
      title: 'Monthly check',
      type: 'task',
      recurrence: 'monthly',
      startAt: '2026-05-01T09:00:00.000Z',
      recurrenceCount: 2,
    })
    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{ endAt: null }>
    expect(insertedRows[0]!.endAt).toBeNull()
  })

  it('fan-out with targetDate includes it in rows', async () => {
    mockReturningInsert.mockResolvedValueOnce([
      {
        id: 'task-1',
        title: 'Daily goal',
        type: 'goal',
        startAt: new Date('2026-05-19T09:00:00.000Z'),
      },
    ])
    await createTask({
      title: 'Daily goal',
      type: 'goal',
      recurrence: 'daily',
      startAt: '2026-05-19T09:00:00.000Z',
      targetDate: new Date('2026-06-30').toISOString(),
      recurrenceCount: 2,
    })
    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{ targetDate: Date | null }>
    expect(insertedRows[0]!.targetDate).toBeInstanceOf(Date)
  })

  it('returns insert-failed error when fan-out insert returns empty', async () => {
    mockReturningInsert.mockResolvedValueOnce([])
    const result = await createTask({
      title: 'Fail',
      type: 'task',
      recurrence: 'daily',
      startAt: '2026-05-19T09:00:00.000Z',
      endAt: '2026-05-19T10:00:00.000Z',
      recurrenceCount: 2,
    })
    expect(result).toMatchObject({ error: 'Insert failed' })
  })

  it('weekly + recurrenceDays fans out one row per selected weekday (Mon AND Tue)', async () => {
    mockReturningInsert.mockResolvedValueOnce([
      { id: 'task-1', title: 'test', type: 'task' },
      { id: 'task-2', title: 'test', type: 'task' },
    ])
    // 2026-05-18 is a Monday. Selecting Mon + Tue must produce that Monday and
    // the following Tuesday, both keeping the original time-of-day.
    await createTask({
      title: 'test',
      type: 'task',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      startAt: '2026-05-18T09:00:00.000Z',
      endAt: '2026-05-18T10:00:00.000Z',
    })

    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{
      startAt: Date
      endAt: Date
      recurrence: string
    }>
    expect(insertedRows).toHaveLength(2)
    expect(insertedRows.map((r) => r.startAt.getUTCDay())).toEqual([1, 2]) // Mon, Tue
    expect(insertedRows[0]!.startAt.toISOString()).toBe('2026-05-18T09:00:00.000Z')
    expect(insertedRows[1]!.startAt.toISOString()).toBe('2026-05-19T09:00:00.000Z')
    expect(insertedRows[0]!.endAt.toISOString()).toBe('2026-05-18T10:00:00.000Z')
    expect(insertedRows[1]!.endAt.toISOString()).toBe('2026-05-19T10:00:00.000Z')
    // recurrence column stays the frequency string.
    expect(insertedRows[0]!.recurrence).toBe('weekly')
  })

  it('weekly + recurrenceDays + recurrenceCount fans out weeks × weekdays', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'task-1', title: 'test', type: 'task' }])
    // Mon + Tue over 2 weeks = 4 rows.
    await createTask({
      title: 'test',
      type: 'task',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      recurrenceCount: 2,
      startAt: '2026-05-18T09:00:00.000Z',
      endAt: '2026-05-18T10:00:00.000Z',
    })
    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{ startAt: Date }>
    expect(insertedRows).toHaveLength(4)
    expect(insertedRows.map((r) => r.startAt.toISOString())).toEqual([
      '2026-05-18T09:00:00.000Z', // week 0 Mon
      '2026-05-19T09:00:00.000Z', // week 0 Tue
      '2026-05-25T09:00:00.000Z', // week 1 Mon
      '2026-05-26T09:00:00.000Z', // week 1 Tue
    ])
  })

  it('weekday fan-out carries color, location, description, allDay and targetDate into rows', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'task-1', title: 'test', type: 'goal' }])
    await createTask({
      title: 'test',
      type: 'goal',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      startAt: '2026-05-18T09:00:00.000Z',
      endAt: '2026-05-18T10:00:00.000Z',
      targetDate: new Date('2026-06-30').toISOString(),
      color: 'violet',
      location: 'Gym',
      description: 'leg day',
      allDay: true,
    })
    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{
      color: string
      location: string
      description: string
      allDay: boolean
      targetDate: Date | null
    }>
    expect(insertedRows).toHaveLength(2)
    expect(insertedRows[0]!.color).toBe('violet')
    expect(insertedRows[0]!.location).toBe('Gym')
    expect(insertedRows[0]!.description).toBe('leg day')
    expect(insertedRows[0]!.allDay).toBe(true)
    expect(insertedRows[0]!.targetDate).toBeInstanceOf(Date)
  })

  it('weekly + recurrenceDays without endAt sets null end dates', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'task-1', title: 'test', type: 'task' }])
    await createTask({
      title: 'test',
      type: 'task',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      startAt: '2026-05-18T09:00:00.000Z',
    })
    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{ endAt: null }>
    expect(insertedRows[0]!.endAt).toBeNull()
    expect(insertedRows[1]!.endAt).toBeNull()
  })

  it('weekday fan-out returns insert-failed when insert returns empty', async () => {
    mockReturningInsert.mockResolvedValueOnce([])
    const result = await createTask({
      title: 'test',
      type: 'task',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      startAt: '2026-05-18T09:00:00.000Z',
    })
    expect(result).toMatchObject({ error: 'Insert failed' })
  })

  it('recurrenceDays is ignored when recurrence is not weekly (single insert)', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'task-1', title: 'test', type: 'task' }])
    await createTask({
      title: 'test',
      type: 'task',
      recurrence: 'daily',
      recurrenceDays: ['Mon', 'Tue'],
      startAt: '2026-05-18T09:00:00.000Z',
    })
    const insertArg = mockValuesInsert.mock.calls[0]![0]
    expect(Array.isArray(insertArg)).toBe(false)
  })

  it('does not fan out when recurrenceCount is omitted', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'task-1', title: 'Run', type: 'task' }])

    await createTask({
      title: 'Run',
      type: 'task',
      recurrence: 'daily',
      startAt: '2026-05-19T07:00:00.000Z',
      endAt: '2026-05-19T08:00:00.000Z',
    })

    const insertArg = mockValuesInsert.mock.calls[0]![0]
    expect(Array.isArray(insertArg)).toBe(false)
  })

  it('weekday fan-out: all rows share one recurrenceGroupId and persist recurrenceDays + recurrenceCount', async () => {
    mockReturningInsert.mockResolvedValueOnce([
      { id: 'task-1', title: 'test', type: 'task' },
      { id: 'task-2', title: 'test', type: 'task' },
      { id: 'task-3', title: 'test', type: 'task' },
      { id: 'task-4', title: 'test', type: 'task' },
    ])
    await createTask({
      title: 'test',
      type: 'task',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      recurrenceCount: 2,
      startAt: '2026-05-18T09:00:00.000Z',
      endAt: '2026-05-18T10:00:00.000Z',
    })
    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{
      recurrenceGroupId: string | null
      recurrenceDays: readonly string[] | null
      recurrenceCount: number | null
    }>
    expect(insertedRows).toHaveLength(4)
    const groupIds = new Set(insertedRows.map((r) => r.recurrenceGroupId))
    expect(groupIds.size).toBe(1)
    expect(insertedRows[0]!.recurrenceGroupId).toBeTruthy()
    for (const row of insertedRows) {
      expect(row.recurrenceDays).toEqual(['Mon', 'Tue'])
      expect(row.recurrenceCount).toBe(2)
    }
  })

  it('weekday fan-out: stamps the client timeZone on every row', async () => {
    mockReturningInsert.mockResolvedValueOnce([
      { id: 'task-1', title: 'test', type: 'task' },
      { id: 'task-2', title: 'test', type: 'task' },
    ])
    await createTask({
      title: 'test',
      type: 'task',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      startAt: '2026-05-18T09:00:00.000Z',
      timeZone: 'America/New_York',
    })
    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{ timeZone: string | null }>
    expect(insertedRows.every((r) => r.timeZone === 'America/New_York')).toBe(true)
  })

  it('weekday fan-out: recurrenceCount persisted as null when not provided', async () => {
    mockReturningInsert.mockResolvedValueOnce([
      { id: 'task-1', title: 'test', type: 'task' },
      { id: 'task-2', title: 'test', type: 'task' },
    ])
    await createTask({
      title: 'test',
      type: 'task',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      startAt: '2026-05-18T09:00:00.000Z',
    })
    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{
      recurrenceCount: number | null
    }>
    expect(insertedRows[0]!.recurrenceCount).toBeNull()
    expect(insertedRows[1]!.recurrenceCount).toBeNull()
  })

  it('two separate createTask calls produce different recurrenceGroupIds', async () => {
    mockReturningInsert.mockResolvedValueOnce([
      { id: 'task-1', title: 'test', type: 'task' },
      { id: 'task-2', title: 'test', type: 'task' },
    ])
    await createTask({
      title: 'test',
      type: 'task',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      startAt: '2026-05-18T09:00:00.000Z',
    })
    const firstRows = mockValuesInsert.mock.calls[0]![0] as Array<{ recurrenceGroupId: string }>

    mockReturningInsert.mockResolvedValueOnce([
      { id: 'task-3', title: 'test2', type: 'task' },
      { id: 'task-4', title: 'test2', type: 'task' },
    ])
    await createTask({
      title: 'test2',
      type: 'task',
      recurrence: 'weekly',
      recurrenceDays: ['Wed', 'Thu'],
      startAt: '2026-05-18T09:00:00.000Z',
    })
    const secondRows = mockValuesInsert.mock.calls[1]![0] as Array<{ recurrenceGroupId: string }>

    expect(firstRows[0]!.recurrenceGroupId).not.toBe(secondRows[0]!.recurrenceGroupId)
  })

  it('count fan-out: all rows share one recurrenceGroupId, recurrenceDays null, recurrenceCount persisted', async () => {
    const rows = [
      {
        id: 'task-1',
        title: 'Meditate',
        type: 'task',
        startAt: new Date('2026-05-19T09:00:00.000Z'),
      },
      {
        id: 'task-2',
        title: 'Meditate',
        type: 'task',
        startAt: new Date('2026-05-20T09:00:00.000Z'),
      },
      {
        id: 'task-3',
        title: 'Meditate',
        type: 'task',
        startAt: new Date('2026-05-21T09:00:00.000Z'),
      },
    ]
    mockReturningInsert.mockResolvedValueOnce(rows)

    await createTask({
      title: 'Meditate',
      type: 'task',
      recurrence: 'daily',
      startAt: '2026-05-19T09:00:00.000Z',
      endAt: '2026-05-19T10:00:00.000Z',
      recurrenceCount: 3,
    })

    const insertedRows = mockValuesInsert.mock.calls[0]![0] as Array<{
      recurrenceGroupId: string | null
      recurrenceDays: readonly string[] | null
      recurrenceCount: number | null
    }>
    const groupIds = new Set(insertedRows.map((r) => r.recurrenceGroupId))
    expect(groupIds.size).toBe(1)
    expect(insertedRows[0]!.recurrenceGroupId).toBeTruthy()
    for (const row of insertedRows) {
      expect(row.recurrenceDays).toBeNull()
      expect(row.recurrenceCount).toBe(3)
    }
  })
})

describe('createTask single insert recurrence group identity', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stamps a fresh non-null recurrenceGroupId when recurrence is set (single insert)', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'task-1', title: 'Meditate', type: 'task' }])
    await createTask({
      title: 'Meditate',
      type: 'task',
      recurrence: 'RRULE:FREQ=DAILY',
    })
    const insertArg = mockValuesInsert.mock.calls[0]![0] as {
      recurrenceGroupId: string | null
      recurrenceCount: number | null
      recurrenceDays: readonly string[] | null
    }
    expect(insertArg.recurrenceGroupId).toBeTruthy()
    expect(insertArg.recurrenceCount).toBeNull()
    expect(insertArg.recurrenceDays).toBeNull()
  })

  it('persists recurrenceDays when a single weekly insert carried days (no startAt to fan out from)', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'task-1', title: 'test', type: 'task' }])
    await createTask({
      title: 'test',
      type: 'task',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
    })
    const insertArg = mockValuesInsert.mock.calls[0]![0] as {
      recurrenceDays: readonly string[] | null
      recurrenceGroupId: string | null
    }
    expect(insertArg.recurrenceDays).toEqual(['Mon', 'Tue'])
    expect(insertArg.recurrenceGroupId).toBeTruthy()
  })

  it('defaults timeZone to null on a single insert with no payload zone', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'task-1', title: 'test', type: 'task' }])
    await createTask({ title: 'test', type: 'task' })
    const insertArg = mockValuesInsert.mock.calls[0]![0] as { timeZone: string | null }
    expect(insertArg.timeZone).toBeNull()
  })

  it('leaves recurrenceGroupId null for a non-recurring single insert', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'task-1', title: 'Run 5k', type: 'goal' }])
    await createTask({ title: 'Run 5k', type: 'goal' })
    const insertArg = mockValuesInsert.mock.calls[0]![0] as { recurrenceGroupId: string | null }
    expect(insertArg.recurrenceGroupId).toBeNull()
  })
})

describe('updateTask', () => {
  // The grouped-row guard selects the row's recurrenceGroupId before writing.
  // Default (set via mockReturnValue, not -Once): ungrouped, so every
  // pre-existing test below is unaffected. The grouped-row guard itself is
  // covered separately in the 'updateTask grouped-row shared-field guard'
  // describe block below.
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectWhere.mockReset()
    mockSelectWhere.mockReturnValue({
      limit: vi.fn().mockResolvedValue([{ recurrenceGroupId: null }]),
    })
  })

  it('updates task status', async () => {
    const result = await updateTask({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'completed',
    })
    expect(result).toMatchObject({ data: { status: 'completed' } })
  })

  it('updates task with all optional fields', async () => {
    mockReturningUpdate.mockResolvedValueOnce([
      { id: 'task-1', title: 'Updated', recurrence: 'RRULE:FREQ=DAILY', type: 'task' },
    ])
    const result = await updateTask({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Updated',
      recurrence: 'RRULE:FREQ=DAILY',
      targetDate: new Date('2026-06-01').toISOString(),
    })
    expect(result).toMatchObject({ data: { title: 'Updated' } })
  })

  it('returns error for invalid uuid', async () => {
    const result = await updateTask({ id: 'not-a-uuid', status: 'completed' })
    expect(result).toHaveProperty('error')
  })

  it('returns error when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await updateTask({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'completed',
    })
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns error when rate limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const result = await updateTask({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'completed',
    })
    expect(result).toMatchObject({ error: 'Too many requests' })
  })

  it('returns not-found when task does not exist', async () => {
    mockReturningUpdate.mockResolvedValueOnce([])
    const result = await updateTask({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'completed',
    })
    expect(result).toMatchObject({ error: 'Not found' })
  })

  it('updates startAt and endAt when provided', async () => {
    mockReturningUpdate.mockResolvedValueOnce([
      { id: 'task-1', type: 'task', startAt: new Date('2026-06-01T09:00:00Z') },
    ])
    const result = await updateTask({
      id: '550e8400-e29b-41d4-a716-446655440000',
      startAt: '2026-06-01T09:00:00.000Z',
      endAt: '2026-06-01T10:00:00.000Z',
    })
    expect(result).toMatchObject({ data: { id: 'task-1' } })
  })

  it('clears startAt when set to null', async () => {
    mockReturningUpdate.mockResolvedValueOnce([{ id: 'task-1', type: 'task', startAt: null }])
    const result = await updateTask({
      id: '550e8400-e29b-41d4-a716-446655440000',
      startAt: null,
      endAt: null,
    })
    expect(result).toMatchObject({ data: { startAt: null } })
  })

  it('clears targetDate when set to null', async () => {
    mockReturningUpdate.mockResolvedValueOnce([{ id: 'task-1', targetDate: null, type: 'task' }])
    const result = await updateTask({
      id: '550e8400-e29b-41d4-a716-446655440000',
      targetDate: null,
    })
    expect(result).toMatchObject({ data: { targetDate: null } })
  })

  it('passes the locked flag through to the update set', async () => {
    await updateTask({ id: '550e8400-e29b-41d4-a716-446655440000', locked: true })
    const setArg = mockSetUpdate.mock.calls[0]![0] as { locked?: boolean }
    expect(setArg.locked).toBe(true)
  })
})

describe('updateTask grouped-row shared-field guard', () => {
  const GROUP_ERROR = 'Grouped rows are series-managed — use updateSeries'
  const ID = '550e8400-e29b-41d4-a716-446655440000'

  const primeGroupRowOnce = (recurrenceGroupId: string | null) => {
    mockSelectWhere.mockReturnValueOnce({
      limit: vi.fn().mockResolvedValue([{ recurrenceGroupId }]),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectWhere.mockReset()
  })

  it('rejects a title edit on a grouped row and does not write', async () => {
    primeGroupRowOnce('grp-1')
    const result = await updateTask({ id: ID, title: 'New title' })
    expect(result).toMatchObject({ error: GROUP_ERROR })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it.each([
    ['recurrence', { recurrence: 'weekly' }],
    ['targetDate', { targetDate: '2026-06-01T00:00:00.000Z' }],
    ['startAt', { startAt: '2026-06-01T09:00:00.000Z' }],
    ['endAt', { endAt: '2026-06-01T10:00:00.000Z' }],
    ['color', { color: 'blue' }],
    ['location', { location: 'Gym' }],
    ['description', { description: 'leg day' }],
    ['allDay', { allDay: true }],
  ])('rejects a grouped-row edit that defines %s', async (_field, patch) => {
    primeGroupRowOnce('grp-1')
    const result = await updateTask({ id: ID, ...patch })
    expect(result).toMatchObject({ error: GROUP_ERROR })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('passes a status-only update on a grouped row', async () => {
    primeGroupRowOnce('grp-1')
    mockReturningUpdate.mockResolvedValueOnce([{ id: 'task-1', status: 'completed', type: 'task' }])
    const result = await updateTask({ id: ID, status: 'completed' })
    expect(result).toMatchObject({ data: { status: 'completed' } })
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('passes a locked-only update on a grouped row', async () => {
    primeGroupRowOnce('grp-1')
    mockReturningUpdate.mockResolvedValueOnce([{ id: 'task-1', type: 'task' }])
    const result = await updateTask({ id: ID, locked: true })
    expect(result).toMatchObject({ data: { id: 'task-1' } })
    expect(mockUpdate).toHaveBeenCalled()
    const setArg = mockSetUpdate.mock.calls[0]![0] as { locked?: boolean }
    expect(setArg.locked).toBe(true)
  })

  it('passes a combined status + locked update on a grouped row', async () => {
    primeGroupRowOnce('grp-1')
    mockReturningUpdate.mockResolvedValueOnce([{ id: 'task-1', status: 'completed', type: 'task' }])
    const result = await updateTask({ id: ID, status: 'completed', locked: true })
    expect(result).toMatchObject({ data: { status: 'completed' } })
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('leaves an ungrouped-row title edit unchanged (passes, writes)', async () => {
    primeGroupRowOnce(null)
    mockReturningUpdate.mockResolvedValueOnce([{ id: 'task-1', title: 'New title', type: 'task' }])
    const result = await updateTask({ id: ID, title: 'New title' })
    expect(result).toMatchObject({ data: { title: 'New title' } })
    expect(mockUpdate).toHaveBeenCalled()
  })
})

describe('deleteTask', () => {
  const DELETE_ID = '550e8400-e29b-41d4-a716-446655440000'
  const primeRowOnce = (recurrenceGroupId: string | null, startAt: Date | null): void => {
    mockSelectWhere.mockReturnValueOnce({
      limit: vi.fn().mockResolvedValue([{ recurrenceGroupId, startAt }]),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectWhere.mockReset()
    // Restore the tombstone insert chain (createTask tests override values() with
    // a returning-only stub that persists past clearAllMocks).
    mockValuesInsert.mockReturnValue({
      returning: mockReturningInsert,
      onConflictDoNothing: mockOnConflict,
    })
    // Default pre-read: an ungrouped row (writes no tombstone).
    mockSelectWhere.mockReturnValue({
      limit: vi.fn().mockResolvedValue([{ recurrenceGroupId: null, startAt: null }]),
    })
  })

  it('deletes task with valid uuid', async () => {
    mockReturningDelete.mockResolvedValueOnce([{ id: 'task-1' }])
    const result = await deleteTask({ id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result).toMatchObject({ data: { success: true } })
  })

  it('writes a slot tombstone (group id + start) for a grouped row, idempotently', async () => {
    primeRowOnce('grp-1', new Date('2026-05-18T09:00:00.000Z'))
    mockReturningDelete.mockResolvedValueOnce([{ id: 'task-1' }])
    await deleteTask({ id: DELETE_ID })
    expect(mockInsert).toHaveBeenCalledTimes(1)
    const tombstone = mockValuesInsert.mock.calls[0]![0] as {
      userId: string
      recurrenceGroupId: string
      slotStart: Date
    }
    expect(tombstone.recurrenceGroupId).toBe('grp-1')
    expect(tombstone.slotStart.toISOString()).toBe('2026-05-18T09:00:00.000Z')
    expect(mockOnConflict).toHaveBeenCalledTimes(1)
  })

  it('writes no tombstone for an ungrouped row', async () => {
    primeRowOnce(null, new Date('2026-05-18T09:00:00.000Z'))
    mockReturningDelete.mockResolvedValueOnce([{ id: 'task-1' }])
    await deleteTask({ id: DELETE_ID })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('writes no tombstone for a grouped row that has no dated slot', async () => {
    primeRowOnce('grp-1', null)
    mockReturningDelete.mockResolvedValueOnce([{ id: 'task-1' }])
    await deleteTask({ id: DELETE_ID })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('writes no tombstone when the delete matched no row (not found)', async () => {
    primeRowOnce('grp-1', new Date('2026-05-18T09:00:00.000Z'))
    mockReturningDelete.mockResolvedValueOnce([])
    const result = await deleteTask({ id: DELETE_ID })
    expect(result).toMatchObject({ error: 'Not found' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns not-found when task does not exist', async () => {
    mockReturningDelete.mockResolvedValueOnce([])
    const result = await deleteTask({ id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result).toMatchObject({ error: 'Not found' })
  })

  it('returns error when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await deleteTask({ id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns error when rate limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const result = await deleteTask({ id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result).toMatchObject({ error: 'Too many requests' })
  })

  it('returns error for invalid uuid', async () => {
    const result = await deleteTask({ id: 'not-a-uuid' })
    expect(result).toHaveProperty('error')
  })
})
