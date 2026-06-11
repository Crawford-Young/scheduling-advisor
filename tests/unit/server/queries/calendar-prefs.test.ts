import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelectResult = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 'cp-1', workingHoursStart: 8, workingHoursEnd: 18 }]),
)
const mockWhere = vi.hoisted(() => vi.fn().mockReturnValue(mockSelectResult()))
const mockFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockFrom }))

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))
vi.mock('@/db', () => ({ db: { select: mockSelect } }))
vi.mock('@/db/schema', () => ({ calendarPrefs: {} }))

import { getCalendarPrefs } from '@/server/queries/calendar-prefs'

describe('getCalendarPrefs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns prefs for authenticated user', async () => {
    mockWhere.mockResolvedValueOnce([{ id: 'cp-1', workingHoursStart: 8, workingHoursEnd: 18 }])
    const result = await getCalendarPrefs()
    expect(result).toMatchObject({ workingHoursStart: 8 })
  })

  it('returns null when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await getCalendarPrefs()
    expect(result).toBeNull()
  })

  it('returns null when no prefs found', async () => {
    mockWhere.mockResolvedValueOnce([])
    const result = await getCalendarPrefs()
    expect(result).toBeNull()
  })
})
