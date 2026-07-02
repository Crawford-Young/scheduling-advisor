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

import { upsertCalendarPrefs, setCalendarWindow } from '@/server/actions/calendar-prefs'

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

describe('setCalendarWindow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await setCalendarWindow({ workingHoursStart: 7, workingHoursEnd: 23 })
    expect(result).toMatchObject({ error: 'Unauthorized' })
  })

  it('inserts wake/sleep window with valid input', async () => {
    const result = await setCalendarWindow({ workingHoursStart: 7, workingHoursEnd: 23 })
    expect(result).toMatchObject({ data: expect.anything() })
    expect(mockInsert).toHaveBeenCalledWith(expect.anything())
    expect(mockValuesInsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123', workingHoursStart: 7, workingHoursEnd: 23 }),
    )
  })

  it('returns error when end is not after start', async () => {
    const result = await setCalendarWindow({ workingHoursStart: 23, workingHoursEnd: 7 })
    expect(result).toHaveProperty('error')
  })

  it('persists dayOverrides, use24h and ttlDays when provided', async () => {
    const dayOverrides = { '0': { wake: 360, sleep: 1320 } }
    const result = await setCalendarWindow({
      workingHoursStart: 420,
      workingHoursEnd: 1380,
      dayOverrides,
      use24h: true,
      ttlDays: 30,
    })
    expect(result).toMatchObject({ data: expect.anything() })
    expect(mockValuesInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        workingHoursStart: 420,
        workingHoursEnd: 1380,
        dayOverrides,
        use24h: true,
        ttlDays: 30,
      }),
    )
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          workingHoursStart: 420,
          workingHoursEnd: 1380,
          dayOverrides,
          use24h: true,
          ttlDays: 30,
          updatedAt: expect.any(Date),
        }),
      }),
    )
  })

  it('persists an explicit null ttlDays (TTL disabled)', async () => {
    await setCalendarWindow({ workingHoursStart: 420, workingHoursEnd: 1380, ttlDays: null })

    const valuesArg = mockValuesInsert.mock.calls[0]![0] as Record<string, unknown>
    expect('ttlDays' in valuesArg).toBe(true)
    expect(valuesArg.ttlDays).toBeNull()

    const setArg = mockOnConflictDoUpdate.mock.calls[0]![0].set as Record<string, unknown>
    expect('ttlDays' in setArg).toBe(true)
    expect(setArg.ttlDays).toBeNull()
  })

  it('does not include dayOverrides, use24h or ttlDays when omitted (back-compat)', async () => {
    await setCalendarWindow({ workingHoursStart: 420, workingHoursEnd: 1380 })

    const valuesArg = mockValuesInsert.mock.calls[0]![0] as Record<string, unknown>
    expect('dayOverrides' in valuesArg).toBe(false)
    expect('use24h' in valuesArg).toBe(false)
    expect('ttlDays' in valuesArg).toBe(false)

    const setArg = mockOnConflictDoUpdate.mock.calls[0]![0].set as Record<string, unknown>
    expect('dayOverrides' in setArg).toBe(false)
    expect('use24h' in setArg).toBe(false)
    expect('ttlDays' in setArg).toBe(false)
  })

  it('returns error when dayOverrides has sleep before wake', async () => {
    const result = await setCalendarWindow({
      workingHoursStart: 7,
      workingHoursEnd: 23,
      dayOverrides: { '1': { wake: 22, sleep: 6 } },
    })
    expect(result).toHaveProperty('error')
  })
})
