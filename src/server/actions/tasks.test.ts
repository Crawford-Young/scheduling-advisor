import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn() } }))

let insertValues: Record<string, unknown> | Array<Record<string, unknown>> = {}
let updateSet: Record<string, unknown> = {}
const id = crypto.randomUUID()

vi.mock('@/db', () => {
  const returning = vi.fn().mockImplementation(() => [{ id, userId: 'u1' }])
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockImplementation((v: Record<string, unknown>) => {
    updateSet = v
    return { where }
  })
  const values = vi
    .fn()
    .mockImplementation((v: Record<string, unknown> | Array<Record<string, unknown>>) => {
      insertValues = v
      return { returning }
    })
  const insert = vi.fn().mockReturnValue({ values })
  const update = vi.fn().mockReturnValue({ set })
  const del = vi.fn().mockReturnValue({ where })
  return { db: { insert, update, delete: del } }
})

import { auth } from '@/auth'

const ISO = '2025-01-01T10:00:00.000Z'

describe('createTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertValues = {}
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
  })

  it('persists rich fields', async () => {
    const { createTask } = await import('./tasks')
    await createTask({
      type: 'task',
      title: 'x',
      startAt: ISO,
      endAt: ISO,
      color: 'blue',
      location: 'Gym',
      description: 'leg day',
      allDay: true,
    })
    expect(insertValues).toMatchObject({
      color: 'blue',
      location: 'Gym',
      description: 'leg day',
      allDay: true,
    })
  })

  it('stamps a fresh non-null recurrenceGroupId for a recurring single insert', async () => {
    const { createTask } = await import('./tasks')
    await createTask({ type: 'task', title: 'x', recurrence: 'daily' })
    expect(insertValues).toMatchObject({ recurrenceGroupId: expect.any(String) })
  })

  it('leaves recurrenceGroupId null for a non-recurring single insert', async () => {
    const { createTask } = await import('./tasks')
    await createTask({ type: 'task', title: 'x' })
    expect(insertValues).toMatchObject({ recurrenceGroupId: null })
  })

  it('produces different recurrenceGroupIds across separate calls', async () => {
    const { createTask } = await import('./tasks')
    await createTask({ type: 'task', title: 'x', recurrence: 'daily' })
    const first = (insertValues as { recurrenceGroupId: string }).recurrenceGroupId

    await createTask({ type: 'task', title: 'y', recurrence: 'daily' })
    const second = (insertValues as { recurrenceGroupId: string }).recurrenceGroupId

    expect(first).not.toBe(second)
  })
})

describe('updateTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateSet = {}
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
  })

  it('sets allDay when provided', async () => {
    const { updateTask } = await import('./tasks')
    await updateTask({ id, allDay: true })
    expect(updateSet).toMatchObject({ allDay: true })
  })
})
