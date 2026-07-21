import { describe, expect, it } from 'vitest'
import {
  HORIZON_WEEKS,
  generateEventSeeds,
  nextGeneratedThrough,
  resolveGenerationWindow,
  type GenerationActivity,
  type GenerationWindow,
} from '@/lib/event-generation'
import type { ActivityScheduleSlot } from '@/lib/schemas/activity'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
const NY = 'America/New_York'

function iso(s: string): string {
  return new Date(s).toISOString()
}

function makeActivity(overrides: Partial<GenerationActivity> = {}): GenerationActivity {
  return {
    title: 'Gym',
    description: null,
    defaultLocation: null,
    color: null,
    schedule: [],
    timeZone: null,
    generatedThrough: null,
    ...overrides,
  }
}

function slot(day: number, startMinutes: number, durationMin = 60): ActivityScheduleSlot {
  return { day, startMinutes, durationMin }
}

describe('constants', () => {
  it('exposes HORIZON_WEEKS', () => {
    expect(HORIZON_WEEKS).toBe(8)
  })
})

describe('resolveGenerationWindow', () => {
  it('from = now, to = now + HORIZON_WEEKS weeks', () => {
    const now = new Date('2026-01-05T12:00:00.000Z')
    const window = resolveGenerationWindow(now)
    expect(window.from.toISOString()).toBe(now.toISOString())
    expect(window.to.toISOString()).toBe(iso('2026-03-02T12:00:00.000Z'))
    expect(window.to.getTime() - window.from.getTime()).toBe(HORIZON_WEEKS * MS_PER_WEEK)
  })
})

describe('nextGeneratedThrough', () => {
  it('returns the window end', () => {
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'),
      to: new Date('2026-03-02T00:00:00.000Z'),
    }
    expect(nextGeneratedThrough(window).toISOString()).toBe(window.to.toISOString())
  })
})

describe('generateEventSeeds', () => {
  it('empty schedule → no seeds', () => {
    const activity = makeActivity({ schedule: [] })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'),
      to: new Date('2026-02-02T00:00:00.000Z'),
    }
    expect(generateEventSeeds({ activity, window })).toEqual([])
  })

  it('null timeZone falls back to UTC wall-clock, seeds copy null defaults', () => {
    // Monday 10:00 UTC weekly slot.
    const activity = makeActivity({ schedule: [slot(1, 600)], timeZone: null })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'), // Monday
      to: new Date('2026-01-19T00:00:00.000Z'), // 2 weeks later
    }
    const seeds = generateEventSeeds({ activity, window })
    expect(seeds).toEqual([
      {
        title: 'Gym',
        description: null,
        location: null,
        color: null,
        startAt: new Date('2026-01-05T10:00:00.000Z'),
        endAt: new Date('2026-01-05T11:00:00.000Z'),
      },
      {
        title: 'Gym',
        description: null,
        location: null,
        color: null,
        startAt: new Date('2026-01-12T10:00:00.000Z'),
        endAt: new Date('2026-01-12T11:00:00.000Z'),
      },
    ])
  })

  it('copies title/description/location/color from the activity and computes endAt from durationMin', () => {
    const activity = makeActivity({
      title: 'Morning Run',
      description: 'Easy 5k',
      defaultLocation: 'Riverside Park',
      color: '#ff8800',
      schedule: [slot(3, 6 * 60, 45)], // Wed 6:00 AM UTC, 45 min
      timeZone: null,
    })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'),
      to: new Date('2026-01-12T00:00:00.000Z'),
    }
    const seeds = generateEventSeeds({ activity, window })
    expect(seeds).toEqual([
      {
        title: 'Morning Run',
        description: 'Easy 5k',
        location: 'Riverside Park',
        color: '#ff8800',
        startAt: new Date('2026-01-07T06:00:00.000Z'),
        endAt: new Date('2026-01-07T06:45:00.000Z'),
      },
    ])
  })

  it('high-water mark excludes already-covered slots, includes only strictly-after', () => {
    const activity = makeActivity({
      schedule: [slot(1, 600)], // Monday 10:00 UTC
      generatedThrough: new Date('2026-01-12T10:00:00.000Z'), // covers through 2nd Monday's slot
    })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'),
      to: new Date('2026-02-02T00:00:00.000Z'), // 4 weeks
    }
    const seeds = generateEventSeeds({ activity, window })
    expect(seeds.map((s) => s.startAt.toISOString())).toEqual([
      iso('2026-01-19T10:00:00.000Z'),
      iso('2026-01-26T10:00:00.000Z'),
    ])
  })

  it('excludes a slot landing exactly at window.to (end exclusive)', () => {
    const activity = makeActivity({ schedule: [slot(1, 600)] }) // Monday 10:00 UTC
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'),
      to: new Date('2026-01-19T10:00:00.000Z'), // exactly the 3rd Monday's 10:00 slot
    }
    const seeds = generateEventSeeds({ activity, window })
    const starts = seeds.map((s) => s.startAt.toISOString())
    expect(starts).toEqual([iso('2026-01-05T10:00:00.000Z'), iso('2026-01-12T10:00:00.000Z')])
    expect(starts).not.toContain(iso('2026-01-19T10:00:00.000Z'))
  })

  it('TZ boundary: an evening America/New_York slot lands on the correct UTC day', () => {
    // Monday 8:30 PM ET (winter, EST = UTC-5) → Tuesday 01:30 UTC — the LOCAL
    // weekday is one day behind the UTC weekday (w2.6 DST lesson).
    const activity = makeActivity({ schedule: [slot(1, 20 * 60 + 30, 60)], timeZone: NY })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'),
      to: new Date('2026-01-12T00:00:00.000Z'),
    }
    const seeds = generateEventSeeds({ activity, window })
    expect(seeds).toHaveLength(1)
    expect(seeds[0]!.startAt.toISOString()).toBe(iso('2026-01-06T01:30:00.000Z'))
  })

  it('round-trips a wall-clock straddling the spring-forward gap (two-pass offset correction)', () => {
    // Sun 2026-03-08 05:00 EDT = 09:00Z. The as-UTC guess resolves to the
    // pre-2am EST offset while the corrected instant is post-2am EDT —
    // forcing the two-pass re-resolution. The seed must round-trip to 09:00Z.
    const activity = makeActivity({ schedule: [slot(0, 5 * 60, 60)], timeZone: NY }) // Sunday 5:00 AM local
    const window: GenerationWindow = {
      from: new Date('2026-03-08T09:00:00.000Z'),
      to: new Date('2026-03-09T00:00:00.000Z'),
    }
    const seeds = generateEventSeeds({ activity, window })
    expect(seeds.map((s) => s.startAt.toISOString())).toEqual([iso('2026-03-08T09:00:00.000Z')])
  })

  it('keeps the LOCAL wall-clock across a spring-forward DST boundary', () => {
    // America/New_York: EST = UTC-5 (winter); EDT = UTC-4 (DST from 2026-03-08).
    const activity = makeActivity({ schedule: [slot(1, 20 * 60 + 30, 60)], timeZone: NY })
    const window: GenerationWindow = {
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-15T00:00:00.000Z'),
    }
    const seeds = generateEventSeeds({ activity, window })
    expect(seeds.map((s) => s.startAt.toISOString())).toEqual([
      iso('2026-03-03T01:30:00.000Z'), // Mon Mar 2, EST (-5): 8:30 PM local
      iso('2026-03-10T00:30:00.000Z'), // Mon Mar 9, EDT (-4): still 8:30 PM local
    ])
  })

  it('keeps the LOCAL wall-clock across a fall-back DST boundary (A9 hardening — A2 review suggestion)', () => {
    // America/New_York: EDT = UTC-4 (until 2026-11-01 2am local); EST =
    // UTC-5 (from 2026-11-01 2am local — the fall-back Sunday).
    const activity = makeActivity({ schedule: [slot(1, 20 * 60 + 30, 60)], timeZone: NY })
    const window: GenerationWindow = {
      from: new Date('2026-10-25T00:00:00.000Z'),
      to: new Date('2026-11-08T00:00:00.000Z'),
    }
    const seeds = generateEventSeeds({ activity, window })
    expect(seeds.map((s) => s.startAt.toISOString())).toEqual([
      iso('2026-10-27T00:30:00.000Z'), // Mon Oct 26, EDT (-4): 8:30 PM local
      iso('2026-11-03T01:30:00.000Z'), // Mon Nov 2, EST (-5): still 8:30 PM local
    ])
  })
})

// A10 fix (c): dedupe guard — a slot landing on the startAt of an already-existing
// pending event is skipped, so a pattern-edit regeneration (generatedThrough reset
// to now) never re-creates events for unchanged days. Changed-day stale events
// still linger (forward-only, hand-deleted) — this guard only prevents duplicates.
describe('generateEventSeeds — dedupe guard (existingStartAtMs)', () => {
  it('skips only the slots whose startAt is already covered, keeping the rest', () => {
    const activity = makeActivity({ schedule: [slot(1, 600)], timeZone: null }) // Mon 10:00 UTC
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'), // Monday
      to: new Date('2026-01-26T00:00:00.000Z'), // Mondays 05, 12, 19
    }
    // The second Monday already has a pending event.
    const existingStartAtMs = new Set([new Date('2026-01-12T10:00:00.000Z').getTime()])
    const seeds = generateEventSeeds({ activity, window, existingStartAtMs })
    expect(seeds.map((s) => s.startAt.toISOString())).toEqual([
      iso('2026-01-05T10:00:00.000Z'),
      iso('2026-01-19T10:00:00.000Z'),
    ])
  })

  it('omitting existingStartAtMs generates every slot (backward-compatible)', () => {
    const activity = makeActivity({ schedule: [slot(1, 600)] })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'),
      to: new Date('2026-01-19T00:00:00.000Z'),
    }
    expect(generateEventSeeds({ activity, window })).toHaveLength(2)
  })

  it('regression: a pattern edit on one day leaves other days event count unchanged', () => {
    // Schedule = Monday + Wednesday. A pattern edit reset generatedThrough to
    // null, so regeneration would re-emit EVERY future slot — but the Mondays
    // already have events, so the dedupe guard emits only the (changed)
    // Wednesday day. The Monday count stays exactly what it was.
    const activity = makeActivity({
      schedule: [slot(1, 600), slot(3, 600)], // Mon + Wed 10:00 UTC
      generatedThrough: null,
    })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'), // Monday
      to: new Date('2026-01-19T00:00:00.000Z'), // Mon 05, Wed 07, Mon 12, Wed 14
    }
    const existingMondays = new Set([
      new Date('2026-01-05T10:00:00.000Z').getTime(),
      new Date('2026-01-12T10:00:00.000Z').getTime(),
    ])
    const seeds = generateEventSeeds({ activity, window, existingStartAtMs: existingMondays })
    // Zero new Monday seeds; both Wednesdays generated.
    expect(seeds.map((s) => s.startAt.toISOString())).toEqual([
      iso('2026-01-07T10:00:00.000Z'),
      iso('2026-01-14T10:00:00.000Z'),
    ])
  })
})
