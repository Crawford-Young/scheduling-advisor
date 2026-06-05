import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  },
}))

vi.mock('@/db/schema', () => ({ tasks: {} }))

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

  it('creates habit with recurrence and targetDate', async () => {
    mockReturningInsert.mockResolvedValueOnce([{ id: 'task-2', title: 'Meditate', type: 'habit' }])
    mockValuesInsert.mockReturnValue({ returning: mockReturningInsert })
    mockInsert.mockReturnValue({ values: mockValuesInsert })
    const result = await createTask({
      title: 'Meditate',
      type: 'habit',
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
