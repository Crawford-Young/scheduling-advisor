import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReturningUpsert = vi.hoisted(() =>
  vi
    .fn()
    .mockResolvedValue([
      { id: 'cp-1', workingHoursStart: 8, workingHoursEnd: 18, maxDailyTaskMinutes: 120 },
    ]),
)
const mockOnConflictDoUpdate = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturningUpsert }),
)
const mockValuesInsert = vi.hoisted(() =>
  vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate }),
)
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockValuesInsert }))

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))

vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))

vi.mock('@/db', () => ({ db: { insert: mockInsert } }))
vi.mock('@/db/schema', () => ({ calendarPrefs: {} }))

import { upsertCalendarPrefs } from '@/server/actions/calendar-prefs'

describe('upsertCalendarPrefs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts calendar prefs with valid input', async () => {
    const result = await upsertCalendarPrefs({
      workingHoursStart: 8,
      workingHoursEnd: 18,
      maxDailyTaskMinutes: 120,
    })
    expect(result).toMatchObject({ data: { workingHoursStart: 8 } })
  })

  it('returns error when end not after start', async () => {
    const result = await upsertCalendarPrefs({
      workingHoursStart: 18,
      workingHoursEnd: 8,
      maxDailyTaskMinutes: 120,
    })
    expect(result).toHaveProperty('error')
  })

  it('returns error for out-of-range values', async () => {
    const result = await upsertCalendarPrefs({
      workingHoursStart: -1,
      workingHoursEnd: 18,
      maxDailyTaskMinutes: 120,
    })
    expect(result).toHaveProperty('error')
  })

  it('returns error when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await upsertCalendarPrefs({
      workingHoursStart: 8,
      workingHoursEnd: 18,
      maxDailyTaskMinutes: 120,
    })
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })
})
