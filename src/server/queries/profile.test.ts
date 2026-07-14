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
  tasks: {
    id: Symbol('tasks.id'),
    userId: Symbol('tasks.userId'),
    title: Symbol('tasks.title'),
    status: Symbol('tasks.status'),
    startAt: Symbol('tasks.startAt'),
    visibility: Symbol('tasks.visibility'),
    recurrenceGroupId: Symbol('tasks.recurrenceGroupId'),
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

describe('getProfileStreaks', () => {
  const NOW = new Date('2026-07-10T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exports PROFILE_STREAK_LIMIT as 3', async () => {
    const { PROFILE_STREAK_LIMIT } = await import('./profile')

    expect(PROFILE_STREAK_LIMIT).toBe(3)
  })

  it('queries tasks for the owner’s grouped rows only', async () => {
    const { tasks } = await import('@/db/schema')
    const { eq, and, isNotNull } = await import('drizzle-orm')
    const { getProfileStreaks } = await import('./profile')

    await getProfileStreaks('viewer-1', 'owner-1')

    expect(vi.mocked(eq)).toHaveBeenCalledWith(tasks.userId, 'owner-1')
    expect(vi.mocked(isNotNull)).toHaveBeenCalledWith(tasks.recurrenceGroupId)
    expect(vi.mocked(and)).toHaveBeenCalled()
  })

  it('keeps a group visible to a stranger when every row is visibility=everyone', async () => {
    mockWhereResolve.mockResolvedValueOnce([
      {
        recurrenceGroupId: 'g-everyone',
        title: 'Morning Run',
        startAt: new Date('2026-07-08T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
      {
        recurrenceGroupId: 'g-everyone',
        title: 'Morning Run Latest',
        startAt: new Date('2026-07-09T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
    ])
    const { getProfileStreaks } = await import('./profile')

    const result = await getProfileStreaks('stranger-1', 'owner-1')

    expect(result).toEqual([{ title: 'Morning Run Latest', current: 2, best: 2 }])
  })

  it('hides a group with any non-everyone row from a stranger but shows it to the owner', async () => {
    const mixedRows = [
      {
        recurrenceGroupId: 'g-mixed',
        title: 'Yoga',
        startAt: new Date('2026-07-07T10:00:00.000Z'),
        status: 'completed',
        visibility: 'only_me',
      },
      {
        recurrenceGroupId: 'g-mixed',
        title: 'Yoga Latest',
        startAt: new Date('2026-07-09T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
    ]
    mockWhereResolve.mockResolvedValue(mixedRows)
    const { getProfileStreaks } = await import('./profile')

    const strangerResult = await getProfileStreaks('stranger-1', 'owner-1')
    const ownerResult = await getProfileStreaks('owner-1', 'owner-1')

    expect(strangerResult).toEqual([])
    expect(ownerResult).toEqual([{ title: 'Yoga Latest', current: 2, best: 2 }])
  })

  it('sorts by current desc then best desc and limits to PROFILE_STREAK_LIMIT', async () => {
    mockWhereResolve.mockResolvedValueOnce([
      // g1: current 2, best 2
      {
        recurrenceGroupId: 'g1',
        title: 'G1 Oldest',
        startAt: new Date('2026-07-08T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
      {
        recurrenceGroupId: 'g1',
        title: 'G1 Latest',
        startAt: new Date('2026-07-09T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
      // g2: current 1, best 3 (best run broken by a past-due pending row)
      {
        recurrenceGroupId: 'g2',
        title: 'G2 A',
        startAt: new Date('2026-07-04T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
      {
        recurrenceGroupId: 'g2',
        title: 'G2 B',
        startAt: new Date('2026-07-05T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
      {
        recurrenceGroupId: 'g2',
        title: 'G2 C',
        startAt: new Date('2026-07-06T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
      {
        recurrenceGroupId: 'g2',
        title: 'G2 D',
        startAt: new Date('2026-07-07T10:00:00.000Z'),
        status: 'pending',
        visibility: 'everyone',
      },
      {
        recurrenceGroupId: 'g2',
        title: 'G2 Latest',
        startAt: new Date('2026-07-08T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
      // g3: current 1, best 1
      {
        recurrenceGroupId: 'g3',
        title: 'G3 Only',
        startAt: new Date('2026-07-09T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
      // g4: current 0, best 0 — should be dropped by the top-3 limit
      {
        recurrenceGroupId: 'g4',
        title: 'G4 Only',
        startAt: new Date('2026-07-09T11:00:00.000Z'),
        status: 'pending',
        visibility: 'everyone',
      },
    ])
    const { getProfileStreaks } = await import('./profile')

    const result = await getProfileStreaks('owner-1', 'owner-1')

    expect(result).toEqual([
      { title: 'G1 Latest', current: 2, best: 2 },
      { title: 'G2 Latest', current: 1, best: 3 },
      { title: 'G3 Only', current: 1, best: 1 },
    ])
  })

  it('uses the title of the row with the latest startAt, treating null startAt as earliest', async () => {
    mockWhereResolve.mockResolvedValueOnce([
      {
        recurrenceGroupId: 'g-title',
        title: 'NullRow',
        startAt: null,
        status: 'pending',
        visibility: 'everyone',
      },
      {
        recurrenceGroupId: 'g-title',
        title: 'Oldest',
        startAt: new Date('2026-07-05T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
      {
        recurrenceGroupId: 'g-title',
        title: 'Newest',
        startAt: new Date('2026-07-09T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
    ])
    const { getProfileStreaks } = await import('./profile')

    const result = await getProfileStreaks('owner-1', 'owner-1')

    expect(result[0]?.title).toBe('Newest')
  })

  it('keeps the current latest when a later-iterated row (including a null startAt) is not actually newer', async () => {
    mockWhereResolve.mockResolvedValueOnce([
      {
        recurrenceGroupId: 'g-order',
        title: 'First',
        startAt: new Date('2026-07-05T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
      {
        recurrenceGroupId: 'g-order',
        title: 'NullMiddle',
        startAt: null,
        status: 'pending',
        visibility: 'everyone',
      },
      {
        recurrenceGroupId: 'g-order',
        title: 'EarlierStill',
        startAt: new Date('2026-07-03T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
      {
        recurrenceGroupId: 'g-order',
        title: 'ActualLatest',
        startAt: new Date('2026-07-09T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
    ])
    const { getProfileStreaks } = await import('./profile')

    const result = await getProfileStreaks('owner-1', 'owner-1')

    expect(result[0]?.title).toBe('ActualLatest')
  })

  it('returns fewer than PROFILE_STREAK_LIMIT entries when the owner has fewer groups', async () => {
    mockWhereResolve.mockResolvedValueOnce([
      {
        recurrenceGroupId: 'g-solo',
        title: 'Solo',
        startAt: new Date('2026-07-09T10:00:00.000Z'),
        status: 'completed',
        visibility: 'everyone',
      },
    ])
    const { getProfileStreaks } = await import('./profile')

    const result = await getProfileStreaks('owner-1', 'owner-1')

    expect(result).toHaveLength(1)
  })
})

describe('getProfileStats', () => {
  describe('visibility filtering', () => {
    const NOW = new Date('2026-07-10T12:00:00.000Z')

    beforeEach(() => {
      vi.useFakeTimers({ now: NOW })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('excludes non-everyone completions for a stranger but includes them for the owner', async () => {
      mockLimit.mockResolvedValue([{ timezone: 'UTC' }])
      mockWhereResolve.mockResolvedValue([
        { id: 't1', startAt: NOW, visibility: 'everyone' },
        { id: 't2', startAt: NOW, visibility: 'only_me' },
      ])
      const { getProfileStats } = await import('./profile')

      const strangerResult = await getProfileStats('stranger-1', 'owner-1')
      const ownerResult = await getProfileStats('owner-1', 'owner-1')

      expect(strangerResult).toEqual({
        completionsThisWeek: 1,
        completionsThisMonth: 1,
        completionsAllTime: 1,
      })
      expect(ownerResult).toEqual({
        completionsThisWeek: 2,
        completionsThisMonth: 2,
        completionsAllTime: 2,
      })
    })

    it('defaults to UTC when the owner row is missing', async () => {
      mockLimit.mockResolvedValueOnce([])
      mockWhereResolve.mockResolvedValueOnce([{ id: 't1', startAt: NOW, visibility: 'everyone' }])
      const { getProfileStats } = await import('./profile')

      const result = await getProfileStats('owner-1', 'owner-1')

      expect(result).toEqual({
        completionsThisWeek: 1,
        completionsThisMonth: 1,
        completionsAllTime: 1,
      })
    })
  })

  describe('timezone window boundaries (America/New_York)', () => {
    const NOW = new Date('2026-07-12T15:00:00.000Z') // Sunday 11:00 ET

    beforeEach(() => {
      vi.useFakeTimers({ now: NOW })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('excludes a completion whose owner-TZ date falls in the previous week/month, includes those in range, and counts all-time regardless', async () => {
      mockLimit.mockResolvedValueOnce([{ timezone: 'America/New_York' }])
      mockWhereResolve.mockResolvedValueOnce([
        // Sunday 03:00 UTC = Saturday 23:00 ET — previous week, same month
        { id: 't1', startAt: new Date('2026-07-12T03:00:00.000Z'), visibility: 'everyone' },
        // Sunday 15:30 UTC = Sunday 11:30 ET — this week, this month
        { id: 't2', startAt: new Date('2026-07-12T15:30:00.000Z'), visibility: 'everyone' },
        // 1st of month 02:00 UTC = prior month (June 30) ET
        { id: 't3', startAt: new Date('2026-07-01T02:00:00.000Z'), visibility: 'everyone' },
        // null startAt: counts toward all-time only
        { id: 't4', startAt: null, visibility: 'everyone' },
      ])
      const { getProfileStats } = await import('./profile')

      const result = await getProfileStats('owner-1', 'owner-1')

      expect(result).toEqual({
        completionsThisWeek: 1,
        completionsThisMonth: 2,
        completionsAllTime: 4,
      })
    })
  })
})
