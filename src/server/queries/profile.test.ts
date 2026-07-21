import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockLimit = vi.fn()
const mockWhere = vi.fn()
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
  users: {
    id: Symbol('users.id'),
    username: Symbol('users.username'),
    name: Symbol('users.name'),
    image: Symbol('users.image'),
    bio: Symbol('users.bio'),
    createdAt: Symbol('users.createdAt'),
    timezone: Symbol('users.timezone'),
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
  ilike: vi.fn((col: unknown, val: unknown) => ({ op: 'ilike', col, val })),
  isNotNull: vi.fn((col: unknown) => ({ op: 'isNotNull', col })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockLimit.mockResolvedValue([])
  mockWhereResolve.mockResolvedValue([])
  mockWhere.mockReturnValue({
    limit: mockLimit,
    then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      mockWhereResolve().then(resolve, reject),
  })
  mockFrom.mockReturnValue({ where: mockWhere })
  mockSelect.mockReturnValue({ from: mockFrom })
})

describe('getProfileByUsername', () => {
  it('returns null when no row is found', async () => {
    mockLimit.mockResolvedValueOnce([])
    const { getProfileByUsername } = await import('./profile')

    const result = await getProfileByUsername('viewer-1', 'ghost')

    expect(result).toBeNull()
  })

  it('returns isOwner true when the row id matches the viewer id', async () => {
    const row = {
      id: 'user-1',
      name: 'Alice',
      username: 'alice',
      image: 'https://example.com/alice.png',
      bio: 'hello, I am alice',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }
    mockLimit.mockResolvedValueOnce([row])
    const { getProfileByUsername } = await import('./profile')

    const result = await getProfileByUsername('user-1', 'alice')

    expect(result).toEqual({
      id: 'user-1',
      name: 'Alice',
      username: 'alice',
      image: 'https://example.com/alice.png',
      bio: 'hello, I am alice',
      createdAt: row.createdAt,
      isOwner: true,
    })
  })

  it('returns isOwner false when the row id differs from the viewer id', async () => {
    const row = {
      id: 'user-2',
      name: 'Bob',
      username: 'bob',
      image: null,
      bio: null,
      createdAt: new Date('2026-02-02T00:00:00Z'),
    }
    mockLimit.mockResolvedValueOnce([row])
    const { getProfileByUsername } = await import('./profile')

    const result = await getProfileByUsername('viewer-1', 'bob')

    expect(result).toEqual({
      id: 'user-2',
      name: 'Bob',
      username: 'bob',
      image: null,
      bio: null,
      createdAt: row.createdAt,
      isOwner: false,
    })
  })

  it('queries users where username equals the requested username', async () => {
    const { users } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')
    mockLimit.mockResolvedValueOnce([])
    const { getProfileByUsername } = await import('./profile')

    await getProfileByUsername('viewer-1', 'carol')

    expect(vi.mocked(eq)).toHaveBeenCalledWith(users.username, 'carol')
    expect(mockLimit).toHaveBeenCalledWith(1)
  })
})

describe('searchUsers', () => {
  it('returns an empty array for an empty query without touching the db', async () => {
    const { searchUsers } = await import('./profile')

    const result = await searchUsers('viewer-1', '')

    expect(result).toEqual([])
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('returns an empty array for a whitespace-only query without touching the db', async () => {
    const { searchUsers } = await import('./profile')

    const result = await searchUsers('viewer-1', '   ')

    expect(result).toEqual([])
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('trims the query before building the search pattern', async () => {
    const { ilike } = await import('drizzle-orm')
    mockLimit.mockResolvedValueOnce([])
    const { searchUsers } = await import('./profile')

    await searchUsers('viewer-1', '  carol  ')

    expect(vi.mocked(ilike)).toHaveBeenCalledWith(expect.anything(), '%carol%')
  })

  it('filters on isNotNull(users.username), ilike(username) OR ilike(name)', async () => {
    const { users } = await import('@/db/schema')
    const { and, or, ilike, isNotNull } = await import('drizzle-orm')
    mockLimit.mockResolvedValueOnce([])
    const { searchUsers } = await import('./profile')

    await searchUsers('viewer-1', 'carol')

    expect(vi.mocked(isNotNull)).toHaveBeenCalledWith(users.username)
    expect(vi.mocked(ilike)).toHaveBeenCalledWith(users.username, '%carol%')
    expect(vi.mocked(ilike)).toHaveBeenCalledWith(users.name, '%carol%')
    expect(vi.mocked(or)).toHaveBeenCalled()
    expect(vi.mocked(and)).toHaveBeenCalled()
  })

  it('limits results to SEARCH_RESULT_LIMIT', async () => {
    mockLimit.mockResolvedValueOnce([])
    const { searchUsers, SEARCH_RESULT_LIMIT } = await import('./profile')

    await searchUsers('viewer-1', 'carol')

    expect(SEARCH_RESULT_LIMIT).toBe(20)
    expect(mockLimit).toHaveBeenCalledWith(SEARCH_RESULT_LIMIT)
  })

  it('does not exclude the viewer from their own results', async () => {
    const row = { username: 'viewer', name: 'Viewer Name', image: null }
    mockLimit.mockResolvedValueOnce([row])
    const { searchUsers } = await import('./profile')

    const result = await searchUsers('viewer-1', 'view')

    expect(result).toEqual([{ username: 'viewer', name: 'Viewer Name', image: null }])
  })

  it('maps rows to username/name/image shape', async () => {
    const rows = [
      { username: 'carol', name: 'Carol', image: 'https://example.com/carol.png' },
      { username: 'carly', name: null, image: null },
    ]
    mockLimit.mockResolvedValueOnce(rows)
    const { searchUsers } = await import('./profile')

    const result = await searchUsers('viewer-1', 'car')

    expect(result).toEqual([
      { username: 'carol', name: 'Carol', image: 'https://example.com/carol.png' },
      { username: 'carly', name: null, image: null },
    ])
  })
})

describe('escapeLikePattern', () => {
  it('escapes percent signs', async () => {
    const { escapeLikePattern } = await import('./profile')

    expect(escapeLikePattern('50%off')).toBe('50' + '\\' + '%' + 'off')
  })

  it('escapes underscores', async () => {
    const { escapeLikePattern } = await import('./profile')

    expect(escapeLikePattern('a_b')).toBe('a' + '\\' + '_' + 'b')
  })

  it('escapes a literal backslash before escaping percent/underscore', async () => {
    const { escapeLikePattern } = await import('./profile')
    // input: one backslash followed by one percent sign
    const input = '\\' + '%'
    // backslash-escape runs first: the single backslash becomes two backslashes;
    // percent-escape then turns the % into a backslash+percent pair
    const expected = '\\' + '\\' + '\\' + '%'

    expect(escapeLikePattern(input)).toBe(expected)
  })

  it('leaves plain characters untouched', async () => {
    const { escapeLikePattern } = await import('./profile')

    expect(escapeLikePattern('hello world')).toBe('hello world')
  })
})
