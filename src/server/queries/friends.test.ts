import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockLimit = vi.fn()
const mockWhere = vi.fn()
const mockInnerJoin = vi.fn()
const mockFrom = vi.fn()
const mockSelect = vi.fn()
// Backs `.where(...)` calls that are awaited directly (no `.limit()`) —
// mirrors real drizzle query builders being thenables. Kept separate from
// mockLimit so a function that issues two queries (one `.limit()`-terminated,
// one not) can control each resolution independently.
const mockWhereResolve = vi.fn()

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
  },
}))

vi.mock('@/db/schema', () => ({
  friendships: {
    id: Symbol('friendships.id'),
    requesterId: Symbol('friendships.requesterId'),
    addresseeId: Symbol('friendships.addresseeId'),
    status: Symbol('friendships.status'),
    createdAt: Symbol('friendships.createdAt'),
  },
  users: {
    id: Symbol('users.id'),
    username: Symbol('users.username'),
    name: Symbol('users.name'),
    image: Symbol('users.image'),
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
}))

// Helper mirroring the plan's example assertion shape — sets the rows the
// mocked db query resolves to for a `.where(...)`-terminated (no `.limit()`)
// call, i.e. every function here except getFriendshipBetween.
function mockDbRows(rows: readonly unknown[]): void {
  mockWhereResolve.mockResolvedValueOnce(rows)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLimit.mockResolvedValue([])
  mockWhereResolve.mockResolvedValue([])
  mockWhere.mockReturnValue({
    limit: mockLimit,
    then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      mockWhereResolve().then(resolve, reject),
  })
  mockInnerJoin.mockReturnValue({ where: mockWhere })
  mockFrom.mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin })
  mockSelect.mockReturnValue({ from: mockFrom })
})

describe('getFriendshipBetween', () => {
  it('returns the row when a friendship exists between the pair', async () => {
    const row = {
      id: 'f1',
      requesterId: 'u1',
      addresseeId: 'u2',
      status: 'accepted',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      respondedAt: null,
    }
    mockLimit.mockResolvedValueOnce([row])
    const { getFriendshipBetween } = await import('./friends')

    const result = await getFriendshipBetween('u1', 'u2')

    expect(result).toEqual(row)
  })

  it('finds the row regardless of which user id is passed first (either-direction lookup)', async () => {
    const row = {
      id: 'f1',
      requesterId: 'u2',
      addresseeId: 'u1',
      status: 'pending',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      respondedAt: null,
    }
    mockLimit.mockResolvedValueOnce([row])
    const { getFriendshipBetween } = await import('./friends')

    const result = await getFriendshipBetween('u1', 'u2')

    expect(result).toEqual(row)
  })

  it('builds the or/and conditions covering both requester/addressee direction combinations', async () => {
    const { and, eq, or } = await import('drizzle-orm')
    const { friendships } = await import('@/db/schema')
    mockLimit.mockResolvedValueOnce([])
    const { getFriendshipBetween } = await import('./friends')

    await getFriendshipBetween('u1', 'u2')

    expect(vi.mocked(eq)).toHaveBeenCalledWith(friendships.requesterId, 'u1')
    expect(vi.mocked(eq)).toHaveBeenCalledWith(friendships.addresseeId, 'u2')
    expect(vi.mocked(eq)).toHaveBeenCalledWith(friendships.requesterId, 'u2')
    expect(vi.mocked(eq)).toHaveBeenCalledWith(friendships.addresseeId, 'u1')
    expect(vi.mocked(and)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(or)).toHaveBeenCalled()
    expect(mockLimit).toHaveBeenCalledWith(1)
  })

  it('returns null when no row is found', async () => {
    mockLimit.mockResolvedValueOnce([])
    const { getFriendshipBetween } = await import('./friends')

    const result = await getFriendshipBetween('u1', 'u2')

    expect(result).toBeNull()
  })
})

describe('getFriends', () => {
  it('maps the other party whichever side the user is on', async () => {
    mockDbRows([
      {
        friendshipId: 'f1',
        userId: 'u2',
        username: 'bob',
        name: 'Bob',
        image: null,
      },
    ])
    const { getFriends } = await import('./friends')

    const rows = await getFriends('u1')

    expect(rows).toEqual([
      { friendshipId: 'f1', userId: 'u2', username: 'bob', name: 'Bob', image: null },
    ])
  })

  it('filters on friendships.status = accepted', async () => {
    const { eq } = await import('drizzle-orm')
    const { friendships } = await import('@/db/schema')
    mockDbRows([])
    const { getFriends } = await import('./friends')

    await getFriends('u1')

    expect(vi.mocked(eq)).toHaveBeenCalledWith(friendships.status, 'accepted')
  })

  it('joins users on either the requester or addressee side matching the user id', async () => {
    const { eq } = await import('drizzle-orm')
    const { friendships, users } = await import('@/db/schema')
    mockDbRows([])
    const { getFriends } = await import('./friends')

    await getFriends('u1')

    expect(vi.mocked(eq)).toHaveBeenCalledWith(friendships.requesterId, 'u1')
    expect(vi.mocked(eq)).toHaveBeenCalledWith(users.id, friendships.addresseeId)
    expect(vi.mocked(eq)).toHaveBeenCalledWith(friendships.addresseeId, 'u1')
    expect(vi.mocked(eq)).toHaveBeenCalledWith(users.id, friendships.requesterId)
  })

  it('returns an empty array when no accepted friendships exist', async () => {
    mockDbRows([])
    const { getFriends } = await import('./friends')

    const rows = await getFriends('u1')

    expect(rows).toEqual([])
  })
})

describe('getIncomingRequests', () => {
  it('returns pending rows with the requester joined', async () => {
    const createdAt = new Date('2026-07-01T00:00:00Z')
    mockDbRows([
      { friendshipId: 'f1', userId: 'u2', username: 'bob', name: 'Bob', image: null, createdAt },
    ])
    const { getIncomingRequests } = await import('./friends')

    const rows = await getIncomingRequests('u1')

    expect(rows).toEqual([
      { friendshipId: 'f1', userId: 'u2', username: 'bob', name: 'Bob', image: null, createdAt },
    ])
  })

  it('joins users on the requester id (the OTHER party for an incoming request)', async () => {
    const { eq } = await import('drizzle-orm')
    const { friendships, users } = await import('@/db/schema')
    mockDbRows([])
    const { getIncomingRequests } = await import('./friends')

    await getIncomingRequests('u1')

    expect(vi.mocked(eq)).toHaveBeenCalledWith(users.id, friendships.requesterId)
  })

  it('filters where the user is the addressee and status is pending', async () => {
    const { eq, and } = await import('drizzle-orm')
    const { friendships } = await import('@/db/schema')
    mockDbRows([])
    const { getIncomingRequests } = await import('./friends')

    await getIncomingRequests('u1')

    expect(vi.mocked(eq)).toHaveBeenCalledWith(friendships.addresseeId, 'u1')
    expect(vi.mocked(eq)).toHaveBeenCalledWith(friendships.status, 'pending')
    expect(vi.mocked(and)).toHaveBeenCalled()
  })

  it('returns an empty array when there are no pending incoming requests', async () => {
    mockDbRows([])
    const { getIncomingRequests } = await import('./friends')

    const rows = await getIncomingRequests('u1')

    expect(rows).toEqual([])
  })
})

describe('getOutgoingRequests', () => {
  it('returns pending rows with the addressee joined', async () => {
    const createdAt = new Date('2026-07-02T00:00:00Z')
    mockDbRows([
      {
        friendshipId: 'f2',
        userId: 'u3',
        username: 'carol',
        name: 'Carol',
        image: null,
        createdAt,
      },
    ])
    const { getOutgoingRequests } = await import('./friends')

    const rows = await getOutgoingRequests('u1')

    expect(rows).toEqual([
      {
        friendshipId: 'f2',
        userId: 'u3',
        username: 'carol',
        name: 'Carol',
        image: null,
        createdAt,
      },
    ])
  })

  it('joins users on the addressee id (the OTHER party for an outgoing request)', async () => {
    const { eq } = await import('drizzle-orm')
    const { friendships, users } = await import('@/db/schema')
    mockDbRows([])
    const { getOutgoingRequests } = await import('./friends')

    await getOutgoingRequests('u1')

    expect(vi.mocked(eq)).toHaveBeenCalledWith(users.id, friendships.addresseeId)
  })

  it('filters where the user is the requester and status is pending', async () => {
    const { eq, and } = await import('drizzle-orm')
    const { friendships } = await import('@/db/schema')
    mockDbRows([])
    const { getOutgoingRequests } = await import('./friends')

    await getOutgoingRequests('u1')

    expect(vi.mocked(eq)).toHaveBeenCalledWith(friendships.requesterId, 'u1')
    expect(vi.mocked(eq)).toHaveBeenCalledWith(friendships.status, 'pending')
    expect(vi.mocked(and)).toHaveBeenCalled()
  })

  it('returns an empty array when there are no pending outgoing requests', async () => {
    mockDbRows([])
    const { getOutgoingRequests } = await import('./friends')

    const rows = await getOutgoingRequests('u1')

    expect(rows).toEqual([])
  })
})
