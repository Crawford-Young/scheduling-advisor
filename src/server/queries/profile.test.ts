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
  events: {
    id: Symbol('events.id'),
    userId: Symbol('events.userId'),
    startAt: Symbol('events.startAt'),
    endAt: Symbol('events.endAt'),
    visibility: Symbol('events.visibility'),
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
  ilike: vi.fn((col: unknown, val: unknown) => ({ op: 'ilike', col, val })),
  isNotNull: vi.fn((col: unknown) => ({ op: 'isNotNull', col })),
  gte: vi.fn((col: unknown, val: unknown) => ({ op: 'gte', col, val })),
  lt: vi.fn((col: unknown, val: unknown) => ({ op: 'lt', col, val })),
  ne: vi.fn((col: unknown, val: unknown) => ({ op: 'ne', col, val })),
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

describe('getProfileWeekEvents', () => {
  const OWNER_ID = 'user-1'
  const VIEWER_ID = 'viewer-9'
  const WEEK_START = '2026-07-19'

  function makeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'evt-1',
      title: 'Team standup',
      description: 'daily sync',
      location: 'Room 4',
      startAt: new Date(2026, 6, 20, 9, 0, 0),
      endAt: new Date(2026, 6, 20, 9, 30, 0),
      allDay: false,
      status: 'pending',
      color: 'blue',
      visibility: 'public',
      activityId: 'act-1',
      ...overrides,
    }
  }

  it('maps every row to kind public for the owner, including a private row', async () => {
    const row = makeRow({ id: 'evt-private', visibility: 'private', status: 'completed' })
    mockWhereResolve.mockResolvedValueOnce([row])
    const { getProfileWeekEvents } = await import('./profile')

    const result = await getProfileWeekEvents(OWNER_ID, OWNER_ID, WEEK_START)

    expect(result).toEqual([
      {
        kind: 'public',
        id: 'evt-private',
        title: 'Team standup',
        startAt: row.startAt,
        endAt: row.endAt,
        allDay: false,
        color: 'blue',
        location: 'Room 4',
        description: 'daily sync',
        completed: true,
      },
    ])
  })

  it('maps a public row to the full public shape for a non-owner', async () => {
    const row = makeRow({ visibility: 'public' })
    mockWhereResolve.mockResolvedValueOnce([row])
    const { getProfileWeekEvents } = await import('./profile')

    const result = await getProfileWeekEvents(VIEWER_ID, OWNER_ID, WEEK_START)

    expect(result).toEqual([
      {
        kind: 'public',
        id: 'evt-1',
        title: 'Team standup',
        startAt: row.startAt,
        endAt: row.endAt,
        allDay: false,
        color: 'blue',
        location: 'Room 4',
        description: 'daily sync',
        completed: false,
      },
    ])
  })

  it('sanitizes a busy row to id/startAt/endAt only for a non-owner', async () => {
    const row = makeRow({ visibility: 'busy' })
    mockWhereResolve.mockResolvedValueOnce([row])
    const { getProfileWeekEvents } = await import('./profile')

    const result = await getProfileWeekEvents(VIEWER_ID, OWNER_ID, WEEK_START)

    expect(result).toEqual([{ kind: 'busy', id: 'evt-1', startAt: row.startAt, endAt: row.endAt }])
    const busyRow = result[0] as Record<string, unknown>
    expect('title' in busyRow).toBe(false)
    expect('location' in busyRow).toBe(false)
    expect('description' in busyRow).toBe(false)
    expect('color' in busyRow).toBe(false)
    expect('activityId' in busyRow).toBe(false)
    expect('allDay' in busyRow).toBe(false)
    expect('completed' in busyRow).toBe(false)
  })

  it('adds a visibility != private predicate only when the viewer is not the owner', async () => {
    const { ne } = await import('drizzle-orm')
    const { events } = await import('@/db/schema')
    mockWhereResolve.mockResolvedValueOnce([])
    const { getProfileWeekEvents } = await import('./profile')

    await getProfileWeekEvents(VIEWER_ID, OWNER_ID, WEEK_START)

    expect(vi.mocked(ne)).toHaveBeenCalledWith(events.visibility, 'private')
  })

  it('omits the visibility predicate entirely for the owner', async () => {
    const { ne } = await import('drizzle-orm')
    mockWhereResolve.mockResolvedValueOnce([])
    const { getProfileWeekEvents } = await import('./profile')

    await getProfileWeekEvents(OWNER_ID, OWNER_ID, WEEK_START)

    expect(vi.mocked(ne)).not.toHaveBeenCalled()
  })

  it('scopes the query to the profile owner, not the viewer', async () => {
    const { eq } = await import('drizzle-orm')
    const { events } = await import('@/db/schema')
    mockWhereResolve.mockResolvedValueOnce([])
    const { getProfileWeekEvents } = await import('./profile')

    await getProfileWeekEvents(VIEWER_ID, OWNER_ID, WEEK_START)

    expect(vi.mocked(eq)).toHaveBeenCalledWith(events.userId, OWNER_ID)
  })

  it('builds the week window via the local Date constructor from weekStart', async () => {
    const { gte, lt } = await import('drizzle-orm')
    const { events } = await import('@/db/schema')
    mockWhereResolve.mockResolvedValueOnce([])
    const { getProfileWeekEvents } = await import('./profile')

    await getProfileWeekEvents(OWNER_ID, OWNER_ID, WEEK_START)

    expect(vi.mocked(gte)).toHaveBeenCalledWith(events.startAt, new Date(2026, 6, 19))
    expect(vi.mocked(lt)).toHaveBeenCalledWith(events.startAt, new Date(2026, 6, 26))
  })

  it('requires startAt and endAt to be non-null', async () => {
    const { isNotNull } = await import('drizzle-orm')
    const { events } = await import('@/db/schema')
    mockWhereResolve.mockResolvedValueOnce([])
    const { getProfileWeekEvents } = await import('./profile')

    await getProfileWeekEvents(OWNER_ID, OWNER_ID, WEEK_START)

    expect(vi.mocked(isNotNull)).toHaveBeenCalledWith(events.startAt)
    expect(vi.mocked(isNotNull)).toHaveBeenCalledWith(events.endAt)
  })

  it('returns an empty array when no rows match', async () => {
    mockWhereResolve.mockResolvedValueOnce([])
    const { getProfileWeekEvents } = await import('./profile')

    const result = await getProfileWeekEvents(OWNER_ID, OWNER_ID, WEEK_START)

    expect(result).toEqual([])
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
