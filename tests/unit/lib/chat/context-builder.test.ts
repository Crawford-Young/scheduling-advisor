import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }) }))

vi.mock('@/server/queries/activities', () => ({ getUserActivities: vi.fn() }))
vi.mock('@/server/queries/events', () => ({ getUserEvents: vi.fn() }))
vi.mock('@/server/queries/tokens', () => ({ getTokenBalance: vi.fn().mockResolvedValue(847) }))
vi.mock('@/server/queries/series', () => ({ getSeriesForUser: vi.fn() }))

import { getUserActivities } from '@/server/queries/activities'
import { getUserEvents } from '@/server/queries/events'
import { getTokenBalance } from '@/server/queries/tokens'
import { getSeriesForUser } from '@/server/queries/series'
import { buildContextBlock } from '@/lib/chat/context-builder'

// Local-constructed dates so the local-wall-clock week math in computeWeeklyFit
// resolves identically on any host timezone (CI runs UTC).
const NOW = new Date(2026, 5, 3, 12, 0) // Wed 2026-06-03 12:00 local
const IN_WEEK = new Date(2026, 5, 4, 9, 0) // Thu 2026-06-04 09:00 local
const OUT_OF_WEEK = new Date(2026, 5, 24, 9, 0) // three weeks later

function activity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'act-1',
    title: 'Morning Run',
    minDurationMin: 30,
    maxDurationMin: 45,
    weeklyTargetSessions: 3,
    ...overrides,
  }
}

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt-1',
    activityId: null,
    title: 'Dentist',
    startAt: IN_WEEK,
    endAt: new Date(IN_WEEK.getTime() + 60 * 60 * 1000),
    allDay: false,
    status: 'pending',
    ...overrides,
  }
}

function series(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'series-1',
    activityId: null,
    title: 'Morning Run',
    freq: 'weekly',
    weekdays: [1],
    dayOfMonth: null,
    nthOrdinal: null,
    nthWeekday: null,
    month: null,
    startMinutes: 420,
    durationMin: 30,
    until: null,
    ...overrides,
  }
}

describe('buildContextBlock (event-series model)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getUserActivities).mockResolvedValue([] as never)
    vi.mocked(getUserEvents).mockResolvedValue([] as never)
    vi.mocked(getTokenBalance).mockResolvedValue(847)
    vi.mocked(getSeriesForUser).mockResolvedValue([] as never)
  })

  it('includes date, timezone, and credit balance', async () => {
    const ctx = await buildContextBlock('America/New_York', NOW)
    expect(ctx).toContain('Timezone: America/New_York')
    expect(ctx).toContain('847')
    expect(ctx).toMatch(/Date: \d{4}-\d{2}-\d{2}/)
  })

  it('lists each activity with duration bounds, weekly target and this-week fit', async () => {
    vi.mocked(getUserActivities).mockResolvedValueOnce([activity()] as never)
    vi.mocked(getUserEvents).mockResolvedValueOnce([
      event({ id: 'done-1', activityId: 'act-1', status: 'completed', startAt: IN_WEEK }),
    ] as never)
    const ctx = await buildContextBlock('UTC', NOW)
    expect(ctx).toContain('Morning Run')
    expect(ctx).toContain('30-45m')
    expect(ctx).toContain('target 3/wk')
    expect(ctx).toContain('this week 1/3')
  })

  it("renders an activity's linked series as a formatSeriesLabel summary", async () => {
    vi.mocked(getUserActivities).mockResolvedValueOnce([activity()] as never)
    vi.mocked(getSeriesForUser).mockResolvedValueOnce([
      series({
        activityId: 'act-1',
        freq: 'weekly',
        weekdays: [1],
        startMinutes: 420,
        durationMin: 30,
      }),
    ] as never)
    const ctx = await buildContextBlock('UTC', NOW)
    // formatSeriesLabel(weekly, [Mon], 7:00, 30m, 24h) => "Mon · 7:00 · 30m"
    expect(ctx).toContain('Mon · 7:00 · 30m')
  })

  it('summarises an activity with no linked series as "no fixed slots"', async () => {
    vi.mocked(getUserActivities).mockResolvedValueOnce([activity()] as never)
    const ctx = await buildContextBlock('UTC', NOW)
    expect(ctx).toContain('no fixed slots')
  })

  it("joins an activity's multiple linked series with a comma", async () => {
    vi.mocked(getUserActivities).mockResolvedValueOnce([activity()] as never)
    vi.mocked(getSeriesForUser).mockResolvedValueOnce([
      series({ id: 's1', activityId: 'act-1', freq: 'daily', startMinutes: 420, durationMin: 30 }),
      series({ id: 's2', activityId: 'act-1', freq: 'daily', startMinutes: 1080, durationMin: 30 }),
    ] as never)
    const ctx = await buildContextBlock('UTC', NOW)
    expect(ctx).toContain('Daily · 7:00, Daily · 18:00')
  })

  it('lists standalone series (no linked activity) in their own block', async () => {
    vi.mocked(getSeriesForUser).mockResolvedValueOnce([
      series({
        id: 'standalone-1',
        activityId: null,
        title: 'Book club',
        freq: 'weekly',
        weekdays: [2],
      }),
    ] as never)
    const ctx = await buildContextBlock('UTC', NOW)
    expect(ctx).toContain('Repeating series (standalone')
    expect(ctx).toContain('[standalone-1] Book club')
  })

  it('excludes an activity-linked series from the standalone series block', async () => {
    vi.mocked(getUserActivities).mockResolvedValueOnce([activity()] as never)
    vi.mocked(getSeriesForUser).mockResolvedValueOnce([
      series({ id: 'linked-1', activityId: 'act-1', title: 'Morning Run' }),
    ] as never)
    const ctx = await buildContextBlock('UTC', NOW)
    expect(ctx).not.toContain('[linked-1]')
  })

  it('caps the standalone series block at 20 lines', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      series({ id: `s-${i}`, activityId: null, title: `Series ${i}` }),
    )
    vi.mocked(getSeriesForUser).mockResolvedValueOnce(many as never)
    const ctx = await buildContextBlock('UTC', NOW)
    expect(ctx).toContain('[s-0]')
    expect(ctx).toContain('[s-19]')
    expect(ctx).not.toContain('[s-20]')
  })

  it('renders an all-day event without a wall-clock time', async () => {
    vi.mocked(getUserEvents).mockResolvedValueOnce([
      event({ id: 'ad', title: 'Conference', allDay: true, startAt: IN_WEEK }),
    ] as never)
    const ctx = await buildContextBlock('UTC', NOW)
    expect(ctx).toMatch(/Conference.*all day/)
  })

  it('lists this-week events and excludes events outside the week', async () => {
    vi.mocked(getUserEvents).mockResolvedValueOnce([
      event({ id: 'this', title: 'This week thing', startAt: IN_WEEK }),
      event({ id: 'later', title: 'Later thing', startAt: OUT_OF_WEEK }),
    ] as never)
    const ctx = await buildContextBlock('UTC', NOW)
    expect(ctx).toContain('This week thing')
    expect(ctx).not.toContain('Later thing')
  })

  it('marks a completed event as done and a pending event as pending', async () => {
    vi.mocked(getUserEvents).mockResolvedValueOnce([
      event({ id: 'a', title: 'Finished', status: 'completed' }),
      event({ id: 'b', title: 'Upcoming', status: 'pending' }),
    ] as never)
    const ctx = await buildContextBlock('UTC', NOW)
    expect(ctx).toMatch(/Finished.*done/)
    expect(ctx).toMatch(/Upcoming.*pending/)
  })

  it('shows (none) for all three blocks when there is no data', async () => {
    const ctx = await buildContextBlock('UTC', NOW)
    expect(ctx).toContain('Activities')
    expect(ctx).toContain("This week's events")
    expect(ctx).toContain('Repeating series')
    expect((ctx.match(/\(none\)/g) ?? []).length).toBe(3)
  })

  it('uses an empty userId when unauthenticated and still renders the header', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const ctx = await buildContextBlock('UTC', NOW)
    expect(ctx).toContain('--- Current Context ---')
    expect(getTokenBalance).toHaveBeenCalledWith('')
    expect(getSeriesForUser).toHaveBeenCalledWith('')
  })
})
