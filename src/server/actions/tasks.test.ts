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
