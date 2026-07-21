import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { computeWeeklyFit, localWeekBounds } from '@/lib/weekly-fit'

// Pinned so localWeekBounds' LOCAL Date-getter math (host-TZ by design — no
// per-user timeZone param, unlike event-generation.ts) is deterministic
// across machines/CI, and so the Saturday-night-vs-UTC divergence case below
// is reproducible. Node re-resolves process.env.TZ per Date call.
const ORIGINAL_TZ = process.env.TZ

beforeAll(() => {
  process.env.TZ = 'America/New_York'
})

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

describe('localWeekBounds', () => {
  it('returns local Sunday 00:00 through the following Sunday 00:00 for a mid-week instant', () => {
    // Wednesday Jan 7 2026 (local) — Jan 4 2026 is a Sunday.
    const now = new Date(2026, 0, 7, 15, 30)

    const { start, end } = localWeekBounds(now)

    expect(start).toEqual(new Date(2026, 0, 4, 0, 0, 0, 0))
    expect(end).toEqual(new Date(2026, 0, 11, 0, 0, 0, 0))
  })

  it('week boundary: a Saturday-night local instant does not cross into the UTC-Sunday week', () => {
    // 2026-01-04T03:00:00Z is Sunday 2026-01-04 in UTC, but only Saturday
    // 2026-01-03 22:00 in America/New_York (TZ pinned above). Reading week
    // membership off the UTC day instead of the local day is exactly the bug
    // this case guards against.
    const now = new Date('2026-01-04T03:00:00.000Z')
    expect(now.getUTCDay()).toBe(0)
    expect(now.getDay()).toBe(6)

    const { start, end } = localWeekBounds(now)

    expect(start).toEqual(new Date(2025, 11, 28, 0, 0, 0, 0))
    expect(end).toEqual(new Date(2026, 0, 4, 0, 0, 0, 0))
  })

  it('an instant already at the local week start returns that same start', () => {
    const now = new Date(2026, 0, 4, 0, 0, 0, 0)

    const { start, end } = localWeekBounds(now)

    expect(start).toEqual(new Date(2026, 0, 4, 0, 0, 0, 0))
    expect(end).toEqual(new Date(2026, 0, 11, 0, 0, 0, 0))
  })
})

describe('computeWeeklyFit', () => {
  const activity = { id: 'act-1', weeklyTargetSessions: 3 }
  // Wednesday Jan 7 2026 (local) — week bounds are Jan 4 (inclusive) .. Jan 11 (exclusive).
  const now = new Date(2026, 0, 7, 12, 0)

  it("counts only this activity's completed events inside the local week", () => {
    const events = [
      { activityId: 'act-1', status: 'completed', startAt: new Date(2026, 0, 5, 9, 0) },
      { activityId: 'act-1', status: 'completed', startAt: new Date(2026, 0, 9, 9, 0) },
    ]

    expect(computeWeeklyFit(activity, events, now)).toEqual({ completed: 2, target: 3 })
  })

  it('excludes events belonging to a different activity', () => {
    const events = [
      { activityId: 'act-2', status: 'completed', startAt: new Date(2026, 0, 5, 9, 0) },
    ]

    expect(computeWeeklyFit(activity, events, now)).toEqual({ completed: 0, target: 3 })
  })

  it('excludes pending (non-completed) events', () => {
    const events = [{ activityId: 'act-1', status: 'pending', startAt: new Date(2026, 0, 5, 9, 0) }]

    expect(computeWeeklyFit(activity, events, now)).toEqual({ completed: 0, target: 3 })
  })

  it('excludes events outside the local week window (before start, or at/after the exclusive end)', () => {
    const events = [
      { activityId: 'act-1', status: 'completed', startAt: new Date(2026, 0, 3, 23, 59) },
      { activityId: 'act-1', status: 'completed', startAt: new Date(2026, 0, 11, 0, 0) },
    ]

    expect(computeWeeklyFit(activity, events, now)).toEqual({ completed: 0, target: 3 })
  })

  it('excludes events with a null startAt', () => {
    const events = [{ activityId: 'act-1', status: 'completed', startAt: null }]

    expect(computeWeeklyFit(activity, events, now)).toEqual({ completed: 0, target: 3 })
  })

  it('always returns the activity weeklyTargetSessions as target, even with zero events', () => {
    expect(computeWeeklyFit(activity, [], now)).toEqual({ completed: 0, target: 3 })
  })
})
