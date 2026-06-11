import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReturning = vi.hoisted(() => vi.fn().mockResolvedValue([{ id: 'task-1' }]))
const mockWhere = vi.hoisted(() => vi.fn().mockReturnValue({ returning: mockReturning }))
const mockSet = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhere }))
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockSet }))

vi.mock('@/db', () => ({ db: { update: mockUpdate } }))
vi.mock('@/db/schema', () => ({ tasks: {} }))
vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }) }))
vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateActivitySettings } from '@/server/actions/activity-settings'

const uuid = '550e8400-e29b-41d4-a716-446655440000'

describe('updateActivitySettings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates solo activity successfully', async () => {
    const result = await updateActivitySettings({
      taskId: uuid,
      activityType: 'solo',
      visibility: 'only_me',
    })
    expect(result).toMatchObject({ data: { id: 'task-1' } })
  })

  it('returns error when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await updateActivitySettings({
      taskId: uuid,
      activityType: 'solo',
      visibility: 'only_me',
    })
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns error when rate limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const result = await updateActivitySettings({
      taskId: uuid,
      activityType: 'solo',
      visibility: 'only_me',
    })
    expect(result).toMatchObject({ error: 'Too many requests' })
  })

  it('returns error for invalid input', async () => {
    const result = await updateActivitySettings({
      taskId: 'bad',
      activityType: 'solo',
      visibility: 'only_me',
    })
    expect(result).toHaveProperty('error')
  })

  it('returns not-found when task does not exist', async () => {
    mockReturning.mockResolvedValueOnce([])
    const result = await updateActivitySettings({
      taskId: uuid,
      activityType: 'solo',
      visibility: 'only_me',
    })
    expect(result).toMatchObject({ error: 'Not found' })
  })

  it('nulls joinability and maxParticipants for solo type', async () => {
    await updateActivitySettings({ taskId: uuid, activityType: 'solo', visibility: 'only_me' })
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ joinability: null, maxParticipants: null }),
    )
  })

  it('sets joinability for group type', async () => {
    await updateActivitySettings({
      taskId: uuid,
      activityType: 'group',
      visibility: 'friends',
      joinability: 'request',
    })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ joinability: 'request' }))
  })

  it('sets joinability to null for group type when joinability is omitted (line 31 ?? null branch)', async () => {
    await updateActivitySettings({
      taskId: uuid,
      activityType: 'group',
      visibility: 'friends',
    })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ joinability: null }))
  })
})
