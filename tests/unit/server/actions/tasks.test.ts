import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockReturningInsert = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 'task-1', title: 'Run 5k', type: 'goal', status: 'pending' }]),
)
const mockValuesInsert = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturningInsert }),
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
}))

// Recording stubs (not real SQL builders) so the updateTaskSeries delete-predicate
// test can assert the exact condition shape passed to `.where()`. Every other test
// in this file is indifferent to these — the where()/set() mocks below return
// fixed values regardless of the condition object they receive.
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  gt: vi.fn((col: unknown, val: unknown) => ({ op: 'gt', col, val })),
}))

import { createTask, updateTask, deleteTask, updateTaskSeries } from '@/server/actions/tasks'

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

  it('leaves recurrenceGroupId null for a non-recurring single insert', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'task-1', title: 'Run 5k', type: 'goal' }])
    await createTask({ title: 'Run 5k', type: 'goal' })
    const insertArg = mockValuesInsert.mock.calls[0]![0] as { recurrenceGroupId: string | null }
    expect(insertArg.recurrenceGroupId).toBeNull()
  })
})

describe('updateTask', () => {
  beforeEach(() => vi.clearAllMocks())

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
})

describe('deleteTask', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes task with valid uuid', async () => {
    mockReturningDelete.mockResolvedValueOnce([{ id: 'task-1' }])
    const result = await deleteTask({ id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result).toMatchObject({ data: { success: true } })
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

describe('updateTaskSeries', () => {
  // 2026-05-18 is a Monday (UTC) — the anchor week for regeneration in these tests.
  const MONDAY = new Date('2026-05-18T00:00:00.000Z')

  interface AnchorRow {
    id: string
    userId: string
    title: string
    type: 'task' | 'goal'
    recurrence: string | null
    recurrenceGroupId: string | null
    recurrenceDays: readonly string[] | null
    recurrenceCount: number | null
    status: string
    targetDate: Date | null
    startAt: Date | null
    endAt: Date | null
    location: string | null
    description: string | null
    color: string | null
    allDay: boolean
  }

  const anchorRow = (overrides: Partial<AnchorRow> = {}): AnchorRow => ({
    id: 'task-1',
    userId: 'user-123',
    title: 'Run',
    type: 'task',
    recurrence: 'weekly',
    recurrenceGroupId: 'grp-1',
    recurrenceDays: ['Mon'],
    recurrenceCount: null,
    status: 'pending',
    targetDate: null,
    startAt: new Date('2026-05-11T09:00:00.000Z'),
    endAt: new Date('2026-05-11T10:00:00.000Z'),
    location: null,
    description: null,
    color: null,
    allDay: false,
    ...overrides,
  })

  // Prime the two select() calls updateTaskSeries makes: the anchor lookup
  // (resolved via .limit(1)) and, only when it proceeds, the completed-rows scan
  // (awaited directly). Priming completed only when needed avoids a leftover
  // mockReturnValueOnce leaking into the next test's anchor lookup.
  const primeSelect = (
    anchor: readonly AnchorRow[],
    completed?: ReadonlyArray<{ startAt: Date | null }>,
  ) => {
    mockSelectWhere.mockReturnValueOnce({ limit: vi.fn().mockResolvedValue(anchor) })
    if (completed !== undefined) {
      mockSelectWhere.mockReturnValueOnce(Promise.resolve(completed))
    }
  }

  const insertedRowsArg = () =>
    mockValuesInsert.mock.calls[0]![0] as Array<{
      startAt: Date
      endAt: Date | null
      recurrenceGroupId: string | null
      recurrenceDays: readonly string[] | null
      recurrenceCount: number | null
      title: string
      type: string
    }>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectWhere.mockReset()
    vi.useFakeTimers({ now: MONDAY })
  })

  afterEach(() => vi.useRealTimers())

  it('returns Unauthorized when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await updateTaskSeries({ taskId: 'task-1', recurrence: 'weekly' })
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns Too many requests when rate limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const result = await updateTaskSeries({ taskId: 'task-1', recurrence: 'weekly' })
    expect(result).toMatchObject({ error: 'Too many requests' })
  })

  it('returns error for invalid input', async () => {
    const result = await updateTaskSeries({ taskId: 'task-1', recurrence: 'yearly' })
    expect(result).toHaveProperty('error')
  })

  it('returns Not found when the anchor task does not exist', async () => {
    primeSelect([])
    const result = await updateTaskSeries({ taskId: 'task-1', recurrence: 'weekly' })
    expect(result).toMatchObject({ error: 'Not found' })
  })

  it("returns 'Not a series' when the task has a null recurrenceGroupId", async () => {
    primeSelect([anchorRow({ recurrenceGroupId: null })])
    const result = await updateTaskSeries({ taskId: 'task-1', recurrence: 'weekly' })
    expect(result).toMatchObject({ error: 'Not a series' })
  })

  it("returns 'Not a series' when the series row has a null startAt", async () => {
    primeSelect([anchorRow({ startAt: null })])
    const result = await updateTaskSeries({ taskId: 'task-1', recurrence: 'weekly' })
    expect(result).toMatchObject({ error: 'Not a series' })
  })

  it('deletes only the group future pending rows: predicate is groupId + userId + status=pending + startAt>now', async () => {
    primeSelect([anchorRow()], [])
    mockReturningInsert.mockResolvedValueOnce([{ id: 'new-1', title: 'Run', type: 'task' }])
    await updateTaskSeries({
      taskId: 'task-1',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
    })
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockWhereDelete).toHaveBeenCalledTimes(1)
    // The condition object passed to .where() for the delete call, built from the
    // recording stubs above — asserts the exact predicate shape, not just call counts.
    expect(mockWhereDelete.mock.calls[0]![0]).toEqual({
      op: 'and',
      args: [
        { op: 'eq', col: 'tasks.recurrenceGroupId', val: 'grp-1' },
        { op: 'eq', col: 'tasks.userId', val: 'user-123' },
        { op: 'eq', col: 'tasks.status', val: 'pending' },
        { op: 'gt', col: 'tasks.startAt', val: MONDAY },
      ],
    })
  })

  it('regenerates a weekly multi-day series anchored at the current week, preserving group id, days and count', async () => {
    primeSelect([anchorRow()], [])
    mockReturningInsert.mockResolvedValueOnce([{ id: 'new-1', title: 'Run', type: 'task' }])
    const result = await updateTaskSeries({
      taskId: 'task-1',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      recurrenceCount: 2,
    })
    const rows = insertedRowsArg()
    expect(rows.map((r) => r.startAt.toISOString())).toEqual([
      '2026-05-18T09:00:00.000Z', // week 0 Mon (anchor week of `now`)
      '2026-05-19T09:00:00.000Z', // week 0 Tue
      '2026-05-25T09:00:00.000Z', // week 1 Mon
      '2026-05-26T09:00:00.000Z', // week 1 Tue
    ])
    for (const row of rows) {
      expect(row.recurrenceGroupId).toBe('grp-1')
      expect(row.recurrenceDays).toEqual(['Mon', 'Tue'])
      expect(row.recurrenceCount).toBe(2)
    }
    expect(result).toMatchObject({ data: { id: 'new-1' } })
  })

  it('preserves the anchor time-of-day and duration on regenerated rows', async () => {
    primeSelect([anchorRow()], [])
    mockReturningInsert.mockResolvedValueOnce([{ id: 'new-1', title: 'Run', type: 'task' }])
    await updateTaskSeries({
      taskId: 'task-1',
      recurrence: 'weekly',
      recurrenceDays: ['Mon'],
    })
    const rows = insertedRowsArg()
    expect(rows[0]!.startAt.toISOString()).toBe('2026-05-18T09:00:00.000Z')
    expect(rows[0]!.endAt!.toISOString()).toBe('2026-05-18T10:00:00.000Z')
  })

  it('persists recurrenceCount as null when omitted (single week)', async () => {
    primeSelect([anchorRow()], [])
    mockReturningInsert.mockResolvedValueOnce([{ id: 'new-1', title: 'Run', type: 'task' }])
    await updateTaskSeries({
      taskId: 'task-1',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
    })
    const rows = insertedRowsArg()
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.recurrenceCount === null)).toBe(true)
  })

  it('skips a regenerated slot that collides with a surviving completed row that week', async () => {
    // Monday 09:00 already completed → its regenerated slot is skipped; a null
    // completed startAt is ignored when building the skip set.
    primeSelect(
      [anchorRow()],
      [{ startAt: null }, { startAt: new Date('2026-05-18T09:00:00.000Z') }],
    )
    mockReturningInsert.mockResolvedValueOnce([{ id: 'new-1', title: 'Run', type: 'task' }])
    await updateTaskSeries({
      taskId: 'task-1',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
    })
    const rows = insertedRowsArg()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.startAt.toISOString()).toBe('2026-05-19T09:00:00.000Z') // Tue only
  })

  it('returns the anchor row without inserting when every slot collides with a completed row', async () => {
    primeSelect(
      [anchorRow()],
      [
        { startAt: new Date('2026-05-18T09:00:00.000Z') },
        { startAt: new Date('2026-05-19T09:00:00.000Z') },
      ],
    )
    const result = await updateTaskSeries({
      taskId: 'task-1',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
    })
    expect(mockInsert).not.toHaveBeenCalled()
    expect(result).toMatchObject({ data: { id: 'task-1' } })
  })

  it('regenerates an interval (daily) series from now when no recurrenceDays given', async () => {
    // endAt null on the anchor → regenerated rows carry null end dates.
    primeSelect([anchorRow({ endAt: null })], [])
    mockReturningInsert.mockResolvedValueOnce([{ id: 'new-1', title: 'Run', type: 'task' }])
    await updateTaskSeries({
      taskId: 'task-1',
      recurrence: 'daily',
      recurrenceCount: 3,
    })
    const rows = insertedRowsArg()
    expect(rows.map((r) => r.startAt.toISOString())).toEqual([
      '2026-05-18T09:00:00.000Z',
      '2026-05-19T09:00:00.000Z',
      '2026-05-20T09:00:00.000Z',
    ])
    expect(rows.every((r) => r.endAt === null)).toBe(true)
    expect(rows.every((r) => r.recurrenceDays === null)).toBe(true)
  })

  it('interval path never persists recurrenceDays, even when the caller sends an empty array', async () => {
    // recurrenceDays: [] has length 0 so the weekday branch is not taken (falls
    // through to the interval builder) — that branch must still force null,
    // matching createTask's interval-fan-out semantics (recurrenceDays is a
    // weekday-path-only concern).
    primeSelect([anchorRow()], [])
    mockReturningInsert.mockResolvedValueOnce([{ id: 'new-1', title: 'Run', type: 'task' }])
    await updateTaskSeries({
      taskId: 'task-1',
      recurrence: 'weekly',
      recurrenceDays: [],
    })
    const rows = insertedRowsArg()
    expect(rows[0]!.recurrenceDays).toBeNull()
  })

  it('mid-week regenerate is future-only: a selected day already past this week is dropped, later weeks keep every selected day', async () => {
    // now = Wednesday mid-day. Anchor time-of-day is 09:00 (from anchorRow()).
    // This week's Monday slot (09:00, two days before "now") must NOT be
    // inserted — only this week's Friday and both days of week 1 (all strictly
    // in the future) survive.
    vi.setSystemTime(new Date('2026-05-20T12:00:00.000Z'))
    primeSelect([anchorRow()], [])
    mockReturningInsert.mockResolvedValueOnce([{ id: 'new-1', title: 'Run', type: 'task' }])
    await updateTaskSeries({
      taskId: 'task-1',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Fri'],
      recurrenceCount: 2,
    })
    const rows = insertedRowsArg()
    const now = new Date('2026-05-20T12:00:00.000Z')

    expect(rows.every((r) => r.startAt.getTime() > now.getTime())).toBe(true)

    const week0 = rows.filter((r) => r.startAt.getTime() < new Date('2026-05-25').getTime())
    expect(week0).toHaveLength(1)
    expect(week0[0]!.startAt.getUTCDay()).toBe(5) // Friday only — Monday already passed

    const week1 = rows.filter((r) => r.startAt.getTime() >= new Date('2026-05-25').getTime())
    expect(week1.map((r) => r.startAt.getUTCDay()).sort()).toEqual([1, 5]) // Mon + Fri
  })

  it('regenerates a single interval occurrence when neither days nor count are given', async () => {
    primeSelect([anchorRow()], [])
    mockReturningInsert.mockResolvedValueOnce([{ id: 'new-1', title: 'Run', type: 'task' }])
    await updateTaskSeries({ taskId: 'task-1', recurrence: 'weekly' })
    const rows = insertedRowsArg()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.startAt.toISOString()).toBe('2026-05-18T09:00:00.000Z')
  })

  it('returns Insert failed when the regenerate insert returns no rows', async () => {
    primeSelect([anchorRow()], [])
    mockReturningInsert.mockResolvedValueOnce([])
    const result = await updateTaskSeries({
      taskId: 'task-1',
      recurrence: 'weekly',
      recurrenceDays: ['Mon'],
    })
    expect(result).toMatchObject({ error: 'Insert failed' })
  })
})
