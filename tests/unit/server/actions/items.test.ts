import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSet, mockUpdate, mockValues, mockInsert, mockConflict } = vi.hoisted(() => {
  const mockWhere = vi.fn().mockResolvedValue(undefined)
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet })
  const mockConflict = vi.fn().mockResolvedValue(undefined)
  const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockConflict })
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues })
  return { mockSet, mockUpdate, mockValues, mockInsert, mockConflict }
})

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/db', () => ({ db: { update: mockUpdate, insert: mockInsert } }))
vi.mock('@/db/schema', () => ({ tasks: {}, checkIns: {} }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn(), sql: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import {
  markItemComplete,
  markItemSkipped,
  rescheduleItem,
  createHabit,
  createGoal,
  createTask,
  updateItem,
} from '@/server/actions/items'

const authedSession = { user: { id: 'user-1' } } as unknown as Awaited<ReturnType<typeof auth>>

describe('markItemComplete', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(await markItemComplete({ taskId: 'task-1', date: '2026-06-01' })).toEqual({
      error: 'Unauthorized',
    })
  })

  it('upserts check-in with completedAt', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await markItemComplete({ taskId: 'task-1', date: '2026-06-01' })
    expect(mockInsert).toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', userId: 'user-1' }),
    )
  })

  it('returns empty object on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(await markItemComplete({ taskId: 'task-1', date: '2026-06-01' })).toEqual({})
  })

  it('revalidates /calendar on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await markItemComplete({ taskId: 'task-1', date: '2026-06-01' })
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/calendar')
  })

  it('uses upsert (onConflictDoUpdate) not plain insert', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await markItemComplete({ taskId: 'task-1', date: '2026-06-01' })
    expect(mockConflict).toHaveBeenCalled()
  })
})

describe('markItemSkipped', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(await markItemSkipped({ taskId: 'task-1', date: '2026-06-01' })).toEqual({
      error: 'Unauthorized',
    })
  })

  it('upserts check-in with skippedAt', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await markItemSkipped({ taskId: 'task-1', date: '2026-06-01' })
    expect(mockInsert).toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', userId: 'user-1' }),
    )
  })

  it('returns empty object on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(await markItemSkipped({ taskId: 'task-1', date: '2026-06-01' })).toEqual({})
  })

  it('revalidates /calendar on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await markItemSkipped({ taskId: 'task-1', date: '2026-06-01' })
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/calendar')
  })

  it('uses upsert (onConflictDoUpdate) not plain insert', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await markItemSkipped({ taskId: 'task-1', date: '2026-06-01' })
    expect(mockConflict).toHaveBeenCalled()
  })
})

describe('rescheduleItem', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(await rescheduleItem({ taskId: 'task-1', newDate: '2026-06-05' })).toEqual({
      error: 'Unauthorized',
    })
  })

  it('updates targetDate on the task', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await rescheduleItem({ taskId: 'task-1', newDate: '2026-06-05' })
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ targetDate: new Date('2026-06-05') }),
    )
  })

  it('returns empty object on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(await rescheduleItem({ taskId: 'task-1', newDate: '2026-06-05' })).toEqual({})
  })

  it('revalidates /calendar on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await rescheduleItem({ taskId: 'task-1', newDate: '2026-06-05' })
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/calendar')
  })
})

describe('createHabit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(
      await createHabit({ title: 'Run', startDate: '2026-06-01', visibility: 'only_me' }),
    ).toEqual({ error: 'Unauthorized' })
  })

  it('inserts a habit record', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await createHabit({ title: 'Run', startDate: '2026-06-01', visibility: 'only_me' })
    expect(mockInsert).toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'habit', title: 'Run', userId: 'user-1' }),
    )
  })

  it('returns empty object on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(
      await createHabit({ title: 'Run', startDate: '2026-06-01', visibility: 'only_me' }),
    ).toEqual({})
  })

  it('revalidates /habits on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await createHabit({ title: 'Run', startDate: '2026-06-01', visibility: 'only_me' })
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/habits')
  })
})

describe('createGoal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(
      await createGoal({ title: 'Write book', targetDate: '2026-12-31', visibility: 'only_me' }),
    ).toEqual({ error: 'Unauthorized' })
  })

  it('inserts a goal record', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await createGoal({ title: 'Write book', targetDate: '2026-12-31', visibility: 'only_me' })
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'goal', title: 'Write book' }),
    )
  })

  it('returns empty object on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(
      await createGoal({ title: 'Write book', targetDate: '2026-12-31', visibility: 'only_me' }),
    ).toEqual({})
  })

  it('revalidates /goals on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await createGoal({ title: 'Write book', targetDate: '2026-12-31', visibility: 'only_me' })
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/goals')
  })
})

describe('createTask', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(
      await createTask({ title: 'Buy groceries', dueDate: '2026-06-02', visibility: 'only_me' }),
    ).toEqual({ error: 'Unauthorized' })
  })

  it('inserts a task record', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await createTask({ title: 'Buy groceries', dueDate: '2026-06-02', visibility: 'only_me' })
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task', title: 'Buy groceries' }),
    )
  })

  it('returns empty object on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(
      await createTask({ title: 'Buy groceries', dueDate: '2026-06-02', visibility: 'only_me' }),
    ).toEqual({})
  })

  it('revalidates /tasks on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await createTask({ title: 'Buy groceries', dueDate: '2026-06-02', visibility: 'only_me' })
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/tasks')
  })
})

describe('updateItem', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(await updateItem({ taskId: 'task-1', fields: { title: 'New title' } })).toEqual({
      error: 'Unauthorized',
    })
  })

  it('updates the task with provided fields', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await updateItem({ taskId: 'task-1', fields: { title: 'New title' } })
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ title: 'New title' }))
  })

  it('returns empty object on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(await updateItem({ taskId: 'task-1', fields: { title: 'New title' } })).toEqual({})
  })

  it('revalidates /calendar on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await updateItem({ taskId: 'task-1', fields: { title: 'New title' } })
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/calendar')
  })
})
