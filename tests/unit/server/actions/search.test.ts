import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLimit = vi.hoisted(() => vi.fn())
const mockOrderBy = vi.hoisted(() => vi.fn().mockReturnValue({ limit: mockLimit }))
const mockWhere = vi.hoisted(() => vi.fn().mockReturnValue({ orderBy: mockOrderBy }))
const mockFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockFrom }))
const mockSearchUsers = vi.hoisted(() => vi.fn())
const mockAuth = vi.hoisted(() => vi.fn())
const mockRateLimit = vi.hoisted(() => vi.fn())

vi.mock('@/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/redis', () => ({ ratelimit: { limit: mockRateLimit } }))
vi.mock('@/db', () => ({ db: { select: mockSelect } }))
vi.mock('@/db/schema', () => ({
  events: {
    id: 'events.id',
    userId: 'events.userId',
    title: 'events.title',
    description: 'events.description',
    location: 'events.location',
    startAt: 'events.startAt',
  },
  activities: {
    id: 'activities.id',
    userId: 'activities.userId',
    title: 'activities.title',
    description: 'activities.description',
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  ilike: vi.fn((col: unknown, val: unknown) => ({ op: 'ilike', col, val })),
  sql: vi.fn((strings: TemplateStringsArray, ...vals: unknown[]) => ({ op: 'sql', strings, vals })),
}))
vi.mock('@/server/queries/profile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/queries/profile')>()),
  searchUsers: mockSearchUsers,
}))

import { globalSearch, searchUsersGlobal } from '@/server/actions/search'
import { eq, ilike } from 'drizzle-orm'

const EVENT_ROWS = [
  { id: 'ev-1', title: 'Dinner', startAt: new Date('2026-07-25T00:00:00Z'), location: null },
]
const ACTIVITY_ROWS = [{ id: 'act-1', title: 'Dinner prep' }]

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'user-123' } })
  mockRateLimit.mockResolvedValue({ success: true })
  mockLimit.mockResolvedValueOnce(EVENT_ROWS).mockResolvedValueOnce(ACTIVITY_ROWS)
  mockSearchUsers.mockResolvedValue([{ username: 'sam', name: 'Sam', image: null }])
})

describe('globalSearch', () => {
  it('returns Unauthorized when there is no session', async () => {
    mockAuth.mockResolvedValueOnce(null as never)
    expect(await globalSearch({ query: 'dinner' })).toEqual({ error: 'Unauthorized' })
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate limited', async () => {
    mockRateLimit.mockResolvedValueOnce({ success: false })
    expect(await globalSearch({ query: 'dinner' })).toEqual({ error: 'Too many requests' })
  })

  it('rejects a too-short query without querying the db', async () => {
    const result = await globalSearch({ query: 'a' })
    expect('error' in result).toBe(true)
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('scopes both queries to the session user and returns both groups', async () => {
    const result = await globalSearch({ query: 'dinner' })
    expect(result).toEqual({ data: { events: EVENT_ROWS, activities: ACTIVITY_ROWS } })
    expect(vi.mocked(eq)).toHaveBeenCalledWith('events.userId', 'user-123')
    expect(vi.mocked(eq)).toHaveBeenCalledWith('activities.userId', 'user-123')
    expect(mockLimit).toHaveBeenCalledTimes(2)
    expect(mockLimit).toHaveBeenCalledWith(8)
  })

  it('escapes LIKE metacharacters in the pattern', async () => {
    await globalSearch({ query: '50%_off' })
    expect(vi.mocked(ilike)).toHaveBeenCalledWith('events.title', '%50\\%\\_off%')
  })
})

describe('searchUsersGlobal', () => {
  it('returns Unauthorized when there is no session', async () => {
    mockAuth.mockResolvedValueOnce(null as never)
    expect(await searchUsersGlobal({ query: 'sam' })).toEqual({ error: 'Unauthorized' })
    expect(mockSearchUsers).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate limited', async () => {
    mockRateLimit.mockResolvedValueOnce({ success: false })
    expect(await searchUsersGlobal({ query: 'sam' })).toEqual({ error: 'Too many requests' })
  })

  it('rejects a too-short query', async () => {
    const result = await searchUsersGlobal({ query: 's' })
    expect('error' in result).toBe(true)
    expect(mockSearchUsers).not.toHaveBeenCalled()
  })

  it('delegates to searchUsers with the session user as viewer', async () => {
    const result = await searchUsersGlobal({ query: ' sam ' })
    expect(mockSearchUsers).toHaveBeenCalledWith('user-123', 'sam')
    expect(result).toEqual({ data: [{ username: 'sam', name: 'Sam', image: null }] })
  })
})
