import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockOrderBy = vi.hoisted(() => vi.fn().mockResolvedValue([{ id: 'task-1', title: 'Run' }]))
const mockWhere = vi.hoisted(() => vi.fn().mockReturnValue({ orderBy: mockOrderBy }))
const mockFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockFrom }))

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))
vi.mock('@/db', () => ({ db: { select: mockSelect } }))
vi.mock('@/db/schema', () => ({ tasks: {} }))

import { getUserTasks } from '@/server/queries/tasks'

describe('getUserTasks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns tasks for authenticated user', async () => {
    const result = await getUserTasks()
    expect(result).toEqual([{ id: 'task-1', title: 'Run' }])
    expect(mockSelect).toHaveBeenCalled()
  })

  it('returns empty array when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await getUserTasks()
    expect(result).toEqual([])
  })
})
