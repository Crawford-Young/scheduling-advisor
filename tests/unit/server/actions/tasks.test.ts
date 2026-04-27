import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReturningInsert = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 'task-1', title: 'Run 5k', type: 'goal', status: 'pending' }]),
)
const mockValuesInsert = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturningInsert }),
)
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockValuesInsert }))

const mockReturningUpdate = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 'task-1', status: 'completed' }]),
)
const mockWhereUpdate = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturningUpdate }),
)
const mockSetUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereUpdate }))
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockSetUpdate }))

const mockWhereDelete = vi.hoisted(() => vi.fn().mockResolvedValue([]))
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
      { id: 'task-1', title: 'Updated', recurrence: 'RRULE:FREQ=DAILY' },
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

  it('returns not-found when task does not exist', async () => {
    mockReturningUpdate.mockResolvedValueOnce([])
    const result = await updateTask({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'completed',
    })
    expect(result).toMatchObject({ error: 'Not found' })
  })

  it('clears targetDate when set to null', async () => {
    mockReturningUpdate.mockResolvedValueOnce([{ id: 'task-1', targetDate: null }])
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
    const result = await deleteTask({ id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result).toMatchObject({ data: { success: true } })
  })

  it('returns error when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await deleteTask({ id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns error for invalid uuid', async () => {
    const result = await deleteTask({ id: 'not-a-uuid' })
    expect(result).toHaveProperty('error')
  })
})
