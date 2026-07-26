import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsertReturning = vi.hoisted(() => vi.fn())
const mockInsertValues = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockInsertReturning }),
)
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockInsertValues }))

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

const mockGetFriendshipBetween = vi.hoisted(() => vi.fn())

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'f3bb07c0-5cbd-4471-84ba-891037f530e3' } }),
}))

vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/db', () => ({
  db: { insert: mockInsert, update: mockUpdate, delete: mockDelete },
}))

vi.mock('@/db/schema', () => ({
  friendships: {
    id: 'friendships.id',
    requesterId: 'friendships.requesterId',
    addresseeId: 'friendships.addresseeId',
    status: 'friendships.status',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
}))

vi.mock('@/server/queries/friends', () => ({
  getFriendshipBetween: mockGetFriendshipBetween,
}))

import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
} from '@/server/actions/friends'
import { revalidatePath } from 'next/cache'
import { friendships } from '@/db/schema'
import { eq, or } from 'drizzle-orm'

const USER_ID = 'f3bb07c0-5cbd-4471-84ba-891037f530e3'
const ADDRESSEE_ID = '75fa6447-bbbd-43bc-9f9e-a4117b27e1e5'
const FRIENDSHIP_ID = '660e8400-e29b-41d4-a716-446655440001'

function friendshipRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: FRIENDSHIP_ID,
    requesterId: USER_ID,
    addresseeId: ADDRESSEE_ID,
    status: 'pending',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    respondedAt: null,
    ...overrides,
  }
}

describe('module export shape', () => {
  it('every export from friends actions is a function (use server contract)', async () => {
    const mod = await import('@/server/actions/friends')
    for (const [name, value] of Object.entries(mod)) {
      expect(typeof value, `export "${name}" must be a function`).toBe('function')
    }
  })
})

describe('sendFriendRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFriendshipBetween.mockResolvedValue(null)
    mockInsertReturning.mockResolvedValue([friendshipRow()])
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await sendFriendRequest({ addresseeId: ADDRESSEE_ID })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns Rate limited when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await sendFriendRequest({ addresseeId: ADDRESSEE_ID })

    expect(result).toEqual({ error: 'Rate limited' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects invalid input and does not touch the db', async () => {
    const result = await sendFriendRequest({ addresseeId: 'not-a-uuid' })

    expect(result).toHaveProperty('error')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects a self-request without touching the db', async () => {
    const result = await sendFriendRequest({ addresseeId: USER_ID })

    expect(result).toEqual({ error: 'Cannot friend yourself' })
    expect(mockGetFriendshipBetween).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects when a request or friendship already exists for the pair', async () => {
    mockGetFriendshipBetween.mockResolvedValueOnce(friendshipRow())

    const result = await sendFriendRequest({ addresseeId: ADDRESSEE_ID })

    expect(mockGetFriendshipBetween).toHaveBeenCalledWith(USER_ID, ADDRESSEE_ID)
    expect(result).toEqual({ error: 'A request or friendship already exists' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('inserts a pending request, revalidates /friends, and returns the row', async () => {
    const inserted = friendshipRow()
    mockInsertReturning.mockResolvedValueOnce([inserted])

    const result = await sendFriendRequest({ addresseeId: ADDRESSEE_ID })

    expect(mockInsert).toHaveBeenCalledWith(friendships)
    expect(mockInsertValues).toHaveBeenCalledWith({
      requesterId: USER_ID,
      addresseeId: ADDRESSEE_ID,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/friends')
    expect(result).toEqual({ data: inserted })
  })

  it('returns a failure error when the insert throws', async () => {
    mockInsertReturning.mockRejectedValueOnce(new Error('db error'))

    const result = await sendFriendRequest({ addresseeId: ADDRESSEE_ID })

    expect(result).toEqual({ error: 'Failed to send friend request' })
  })
})

describe('acceptFriendRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateReturning.mockResolvedValue([friendshipRow({ status: 'accepted' })])
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await acceptFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns Rate limited when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await acceptFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(result).toEqual({ error: 'Rate limited' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects invalid input and does not touch the db', async () => {
    const result = await acceptFriendRequest({ friendshipId: 'not-a-uuid' })

    expect(result).toHaveProperty('error')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('binds the update predicate to the caller session id as the addressee, pending only', async () => {
    await acceptFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(mockUpdate).toHaveBeenCalledWith(friendships)
    expect(vi.mocked(eq).mock.calls).toContainEqual([friendships.id, FRIENDSHIP_ID])
    expect(vi.mocked(eq).mock.calls).toContainEqual([friendships.addresseeId, USER_ID])
    expect(vi.mocked(eq).mock.calls).toContainEqual([friendships.status, 'pending'])
  })

  it('returns Request not found when the caller is not the addressee (zero rows matched)', async () => {
    mockUpdateReturning.mockResolvedValueOnce([])

    const result = await acceptFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(result).toEqual({ error: 'Request not found' })
  })

  it('accepts, revalidates /friends, and returns the updated row (status accepted + respondedAt Date)', async () => {
    const respondedAt = new Date('2026-07-26T00:00:00.000Z')
    const updated = friendshipRow({ status: 'accepted', respondedAt })
    mockUpdateReturning.mockResolvedValueOnce([updated])

    const result = await acceptFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'accepted', respondedAt: expect.any(Date) }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/friends')
    expect(result).toEqual({ data: updated })
    if ('data' in result) {
      expect(result.data.status).toBe('accepted')
      expect(result.data.respondedAt).toBeInstanceOf(Date)
    }
  })
})

describe('declineFriendRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteReturning.mockResolvedValue([friendshipRow()])
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await declineFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('returns Rate limited when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await declineFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(result).toEqual({ error: 'Rate limited' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('rejects invalid input and does not touch the db', async () => {
    const result = await declineFriendRequest({ friendshipId: 'not-a-uuid' })

    expect(result).toHaveProperty('error')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('binds the delete predicate to the caller session id as the addressee, pending only', async () => {
    await declineFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(mockDelete).toHaveBeenCalledWith(friendships)
    expect(vi.mocked(eq).mock.calls).toContainEqual([friendships.id, FRIENDSHIP_ID])
    expect(vi.mocked(eq).mock.calls).toContainEqual([friendships.addresseeId, USER_ID])
    expect(vi.mocked(eq).mock.calls).toContainEqual([friendships.status, 'pending'])
  })

  it('returns Request not found when the caller is not the addressee (zero rows matched)', async () => {
    mockDeleteReturning.mockResolvedValueOnce([])

    const result = await declineFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(result).toEqual({ error: 'Request not found' })
  })

  it('declines, revalidates /friends, and returns success', async () => {
    const result = await declineFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(revalidatePath).toHaveBeenCalledWith('/friends')
    expect(result).toEqual({ data: { success: true } })
  })
})

describe('cancelFriendRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteReturning.mockResolvedValue([friendshipRow()])
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await cancelFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('returns Rate limited when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await cancelFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(result).toEqual({ error: 'Rate limited' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('rejects invalid input and does not touch the db', async () => {
    const result = await cancelFriendRequest({ friendshipId: 'not-a-uuid' })

    expect(result).toHaveProperty('error')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('binds the delete predicate to the caller session id as the requester, pending only', async () => {
    await cancelFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(mockDelete).toHaveBeenCalledWith(friendships)
    expect(vi.mocked(eq).mock.calls).toContainEqual([friendships.id, FRIENDSHIP_ID])
    expect(vi.mocked(eq).mock.calls).toContainEqual([friendships.requesterId, USER_ID])
    expect(vi.mocked(eq).mock.calls).toContainEqual([friendships.status, 'pending'])
  })

  it('returns Request not found when the caller is not the requester (zero rows matched)', async () => {
    mockDeleteReturning.mockResolvedValueOnce([])

    const result = await cancelFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(result).toEqual({ error: 'Request not found' })
  })

  it('cancels, revalidates /friends, and returns success', async () => {
    const result = await cancelFriendRequest({ friendshipId: FRIENDSHIP_ID })

    expect(revalidatePath).toHaveBeenCalledWith('/friends')
    expect(result).toEqual({ data: { success: true } })
  })
})

describe('removeFriend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteReturning.mockResolvedValue([friendshipRow({ status: 'accepted' })])
  })

  it('returns Unauthorized when no session', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    const result = await removeFriend({ friendshipId: FRIENDSHIP_ID })

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('returns Rate limited when rate-limited', async () => {
    const { ratelimit } = await import('@/lib/redis')
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)

    const result = await removeFriend({ friendshipId: FRIENDSHIP_ID })

    expect(result).toEqual({ error: 'Rate limited' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('rejects invalid input and does not touch the db', async () => {
    const result = await removeFriend({ friendshipId: 'not-a-uuid' })

    expect(result).toHaveProperty('error')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('binds the delete predicate to either party as the caller session id, accepted only', async () => {
    await removeFriend({ friendshipId: FRIENDSHIP_ID })

    expect(mockDelete).toHaveBeenCalledWith(friendships)
    expect(vi.mocked(eq).mock.calls).toContainEqual([friendships.id, FRIENDSHIP_ID])
    expect(vi.mocked(eq).mock.calls).toContainEqual([friendships.status, 'accepted'])
    expect(vi.mocked(or).mock.calls[0]).toEqual([
      { op: 'eq', col: friendships.requesterId, val: USER_ID },
      { op: 'eq', col: friendships.addresseeId, val: USER_ID },
    ])
  })

  it('returns Friendship not found when the caller is neither party (zero rows matched)', async () => {
    mockDeleteReturning.mockResolvedValueOnce([])

    const result = await removeFriend({ friendshipId: FRIENDSHIP_ID })

    expect(result).toEqual({ error: 'Friendship not found' })
  })

  it('removes, revalidates /friends, and returns success', async () => {
    const result = await removeFriend({ friendshipId: FRIENDSHIP_ID })

    expect(revalidatePath).toHaveBeenCalledWith('/friends')
    expect(result).toEqual({ data: { success: true } })
  })
})
