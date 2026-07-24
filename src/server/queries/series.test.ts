import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockWhere = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockFrom }))

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
  },
}))

vi.mock('@/db/schema', () => ({
  eventSeries: {
    userId: Symbol('eventSeries.userId'),
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockWhere.mockResolvedValue([])
  mockFrom.mockReturnValue({ where: mockWhere })
  mockSelect.mockReturnValue({ from: mockFrom })
})

describe('getSeriesForUser', () => {
  it('returns the rows resolved by the query', async () => {
    const rows = [{ id: 's1' }, { id: 's2' }]
    mockWhere.mockResolvedValueOnce(rows)
    const { getSeriesForUser } = await import('./series')

    const result = await getSeriesForUser('user-1')

    expect(result).toEqual(rows)
  })

  it('scopes the query to eventSeries.userId via eq, selecting from eventSeries', async () => {
    const { eventSeries } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')
    const { getSeriesForUser } = await import('./series')

    await getSeriesForUser('user-1')

    expect(vi.mocked(eq)).toHaveBeenCalledWith(eventSeries.userId, 'user-1')
    expect(mockSelect).toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledWith(eventSeries)
  })

  it('returns an empty array when the user has no series rows', async () => {
    mockWhere.mockResolvedValueOnce([])
    const { getSeriesForUser } = await import('./series')

    const result = await getSeriesForUser('user-1')

    expect(result).toEqual([])
  })
})
