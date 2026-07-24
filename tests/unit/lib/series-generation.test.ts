import { describe, expect, it } from 'vitest'
import {
  HORIZON_WEEKS,
  generateSeriesSeeds,
  nextGeneratedThrough,
  resolveGenerationWindow,
  type GenerationSeries,
  type GenerationWindow,
} from '@/lib/series-generation'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
const NY = 'America/New_York'

function iso(s: string): string {
  return new Date(s).toISOString()
}

function makeSeries(overrides: Partial<GenerationSeries> = {}): GenerationSeries {
  return {
    title: 'Gym',
    description: null,
    location: null,
    color: null,
    visibility: 'private',
    freq: 'daily',
    weekdays: null,
    dayOfMonth: null,
    nthOrdinal: null,
    nthWeekday: null,
    month: null,
    startMinutes: 600, // 10:00
    durationMin: 60,
    timeZone: null,
    until: null,
    generatedThrough: null,
    ...overrides,
  }
}

function starts(seeds: readonly { startAt: Date }[]): string[] {
  return seeds.map((s) => s.startAt.toISOString())
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
  const window: GenerationWindow = {
    from: new Date('2026-01-05T00:00:00.000Z'),
    to: new Date('2026-03-02T00:00:00.000Z'),
  }

  it('returns the window end when until is null', () => {
    expect(nextGeneratedThrough(window, null).toISOString()).toBe(window.to.toISOString())
  })

  it('pins the mark at until when until is before the window end', () => {
    const until = new Date('2026-02-15T00:00:00.000Z')
    expect(nextGeneratedThrough(window, until).toISOString()).toBe(until.toISOString())
  })

  it('returns the window end when until is after the window end', () => {
    const until = new Date('2026-04-01T00:00:00.000Z')
    expect(nextGeneratedThrough(window, until).toISOString()).toBe(window.to.toISOString())
  })
})

describe('generateSeriesSeeds — seed shape', () => {
  it('copies title/description/location/color/visibility and computes endAt from durationMin', () => {
    const series = makeSeries({
      title: 'Morning Run',
      description: 'Easy 5k',
      location: 'Riverside Park',
      color: '#ff8800',
      visibility: 'public',
      freq: 'daily',
      startMinutes: 6 * 60, // 06:00 UTC
      durationMin: 45,
    })
    const window: GenerationWindow = {
      from: new Date('2026-01-07T00:00:00.000Z'),
      to: new Date('2026-01-08T00:00:00.000Z'),
    }
    expect(generateSeriesSeeds({ series, window })).toEqual([
      {
        title: 'Morning Run',
        description: 'Easy 5k',
        location: 'Riverside Park',
        color: '#ff8800',
        visibility: 'public',
        startAt: new Date('2026-01-07T06:00:00.000Z'),
        endAt: new Date('2026-01-07T06:45:00.000Z'),
      },
    ])
  })

  it.each(['public', 'busy', 'private'] as const)(
    'copies visibility "%s" onto the seed',
    (visibility) => {
      const series = makeSeries({ freq: 'daily', visibility })
      const window: GenerationWindow = {
        from: new Date('2026-01-07T00:00:00.000Z'),
        to: new Date('2026-01-08T00:00:00.000Z'),
      }
      const [seed] = generateSeriesSeeds({ series, window })
      expect(seed?.visibility).toBe(visibility)
    },
  )
})

describe('generateSeriesSeeds — daily', () => {
  it('generates every day in the window', () => {
    const series = makeSeries({ freq: 'daily', startMinutes: 600 })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'),
      to: new Date('2026-01-08T00:00:00.000Z'),
    }
    expect(starts(generateSeriesSeeds({ series, window }))).toEqual([
      iso('2026-01-05T10:00:00.000Z'),
      iso('2026-01-06T10:00:00.000Z'),
      iso('2026-01-07T10:00:00.000Z'),
    ])
  })

  it('excludes a same-day slot earlier than window.from (from inclusive)', () => {
    const series = makeSeries({ freq: 'daily', startMinutes: 600 })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T12:00:00.000Z'), // noon — the 10:00 slot is behind it
      to: new Date('2026-01-07T00:00:00.000Z'),
    }
    expect(starts(generateSeriesSeeds({ series, window }))).toEqual([
      iso('2026-01-06T10:00:00.000Z'),
    ])
  })

  it('excludes a slot landing exactly at window.to (to exclusive)', () => {
    const series = makeSeries({ freq: 'daily', startMinutes: 600 })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'),
      to: new Date('2026-01-08T10:00:00.000Z'), // exactly the Jan 8 10:00 slot
    }
    const result = starts(generateSeriesSeeds({ series, window }))
    expect(result).toEqual([
      iso('2026-01-05T10:00:00.000Z'),
      iso('2026-01-06T10:00:00.000Z'),
      iso('2026-01-07T10:00:00.000Z'),
    ])
    expect(result).not.toContain(iso('2026-01-08T10:00:00.000Z'))
  })
})

describe('generateSeriesSeeds — weekly', () => {
  it('respects the weekday set including Sunday and Saturday', () => {
    // Sun (0) + Sat (6). Jan 1 2026 is Thursday, so Jan 4 is Sunday.
    const series = makeSeries({ freq: 'weekly', weekdays: [0, 6], startMinutes: 600 })
    const window: GenerationWindow = {
      from: new Date('2026-01-04T00:00:00.000Z'), // Sunday
      to: new Date('2026-01-18T00:00:00.000Z'),
    }
    expect(starts(generateSeriesSeeds({ series, window }))).toEqual([
      iso('2026-01-04T10:00:00.000Z'), // Sun
      iso('2026-01-10T10:00:00.000Z'), // Sat
      iso('2026-01-11T10:00:00.000Z'), // Sun
      iso('2026-01-17T10:00:00.000Z'), // Sat
    ])
  })
})

describe('generateSeriesSeeds — monthly day-of-month', () => {
  it('clamps day 31 to the last day of short months (Feb 28, Apr 30)', () => {
    const series = makeSeries({ freq: 'monthly', dayOfMonth: 31, startMinutes: 600 })
    const window: GenerationWindow = {
      from: new Date('2026-01-15T00:00:00.000Z'),
      to: new Date('2026-05-05T00:00:00.000Z'),
    }
    expect(starts(generateSeriesSeeds({ series, window }))).toEqual([
      iso('2026-01-31T10:00:00.000Z'),
      iso('2026-02-28T10:00:00.000Z'), // clamped from 31
      iso('2026-03-31T10:00:00.000Z'),
      iso('2026-04-30T10:00:00.000Z'), // clamped from 31
    ])
  })
})

describe('generateSeriesSeeds — monthly nth weekday', () => {
  it('places the 3rd Thursday correctly across two months', () => {
    // Thursday = 4. Feb 2026 1st = Sunday → 3rd Thu = Feb 19; Mar 2026 → Mar 19.
    const series = makeSeries({
      freq: 'monthly',
      nthOrdinal: 3,
      nthWeekday: 4,
      startMinutes: 600,
    })
    const window: GenerationWindow = {
      from: new Date('2026-02-01T00:00:00.000Z'),
      to: new Date('2026-04-01T00:00:00.000Z'),
    }
    expect(starts(generateSeriesSeeds({ series, window }))).toEqual([
      iso('2026-02-19T10:00:00.000Z'),
      iso('2026-03-19T10:00:00.000Z'),
    ])
  })

  it('the 4th weekday differs from the last in a 5-occurrence month', () => {
    // Jan 2026 Fridays: 2, 9, 16, 23, 30 — 4th Friday = Jan 23 (≠ last, Jan 30).
    const series = makeSeries({
      freq: 'monthly',
      nthOrdinal: 4,
      nthWeekday: 5, // Friday
      startMinutes: 600,
    })
    const window: GenerationWindow = {
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-02-01T00:00:00.000Z'),
    }
    expect(starts(generateSeriesSeeds({ series, window }))).toEqual([
      iso('2026-01-23T10:00:00.000Z'),
    ])
  })

  it('places the last weekday correctly in a 5-Friday month and a 4-Friday month', () => {
    // -1 = last. Jan 2026 has 5 Fridays (last = Jan 30); Feb 2026 has 4 (last = Feb 27).
    const series = makeSeries({
      freq: 'monthly',
      nthOrdinal: -1,
      nthWeekday: 5, // Friday
      startMinutes: 600,
    })
    const window: GenerationWindow = {
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-03-01T00:00:00.000Z'),
    }
    expect(starts(generateSeriesSeeds({ series, window }))).toEqual([
      iso('2026-01-30T10:00:00.000Z'),
      iso('2026-02-27T10:00:00.000Z'),
    ])
  })
})

describe('generateSeriesSeeds — yearly', () => {
  it('Feb 29 rule clamps to Feb 28 in a non-leap year', () => {
    const series = makeSeries({ freq: 'yearly', month: 2, dayOfMonth: 29, startMinutes: 600 })
    const window: GenerationWindow = {
      from: new Date('2026-02-01T00:00:00.000Z'),
      to: new Date('2026-03-01T00:00:00.000Z'),
    }
    expect(starts(generateSeriesSeeds({ series, window }))).toEqual([
      iso('2026-02-28T10:00:00.000Z'),
    ])
  })

  it('Feb 29 rule keeps Feb 29 in a leap year', () => {
    const series = makeSeries({ freq: 'yearly', month: 2, dayOfMonth: 29, startMinutes: 600 })
    const window: GenerationWindow = {
      from: new Date('2028-02-01T00:00:00.000Z'),
      to: new Date('2028-03-01T00:00:00.000Z'),
    }
    expect(starts(generateSeriesSeeds({ series, window }))).toEqual([
      iso('2028-02-29T10:00:00.000Z'),
    ])
  })
})

describe('generateSeriesSeeds — until boundary', () => {
  it('includes a slot exactly at until and excludes the next (until inclusive)', () => {
    const series = makeSeries({
      freq: 'daily',
      startMinutes: 600,
      until: new Date('2026-01-08T10:00:00.000Z'), // exactly the Jan 8 slot
    })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'),
      to: new Date('2026-01-12T00:00:00.000Z'),
    }
    const result = starts(generateSeriesSeeds({ series, window }))
    expect(result).toEqual([
      iso('2026-01-05T10:00:00.000Z'),
      iso('2026-01-06T10:00:00.000Z'),
      iso('2026-01-07T10:00:00.000Z'),
      iso('2026-01-08T10:00:00.000Z'),
    ])
    expect(result).not.toContain(iso('2026-01-09T10:00:00.000Z'))
  })

  it('returns no seeds when the window is entirely after until', () => {
    const series = makeSeries({
      freq: 'daily',
      startMinutes: 600,
      until: new Date('2026-01-01T00:00:00.000Z'),
    })
    const window: GenerationWindow = {
      from: new Date('2026-02-01T00:00:00.000Z'),
      to: new Date('2026-03-01T00:00:00.000Z'),
    }
    expect(generateSeriesSeeds({ series, window })).toEqual([])
  })
})

describe('generateSeriesSeeds — generatedThrough high-water mark', () => {
  it('includes only slots strictly after generatedThrough', () => {
    const series = makeSeries({
      freq: 'daily',
      startMinutes: 600,
      generatedThrough: new Date('2026-01-06T10:00:00.000Z'), // exactly the Jan 6 slot
    })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'),
      to: new Date('2026-01-09T00:00:00.000Z'),
    }
    // Jan 5 (< mark) and Jan 6 (== mark, strict) excluded; Jan 7, 8 kept.
    expect(starts(generateSeriesSeeds({ series, window }))).toEqual([
      iso('2026-01-07T10:00:00.000Z'),
      iso('2026-01-08T10:00:00.000Z'),
    ])
  })
})

describe('generateSeriesSeeds — dedupe (existingStartAtMs)', () => {
  it('skips only slots whose startAt is already present, keeping the rest', () => {
    const series = makeSeries({ freq: 'daily', startMinutes: 600 })
    const window: GenerationWindow = {
      from: new Date('2026-01-05T00:00:00.000Z'),
      to: new Date('2026-01-09T00:00:00.000Z'),
    }
    const existingStartAtMs = new Set([
      new Date('2026-01-06T10:00:00.000Z').getTime(),
      new Date('2026-01-08T10:00:00.000Z').getTime(),
    ])
    expect(starts(generateSeriesSeeds({ series, window, existingStartAtMs }))).toEqual([
      iso('2026-01-05T10:00:00.000Z'),
      iso('2026-01-07T10:00:00.000Z'),
    ])
  })
})

describe('generateSeriesSeeds — DST (America/New_York)', () => {
  it('keeps wall-clock startMinutes across the spring-forward boundary', () => {
    // Spring forward: 2026-03-08 02:00 local. Daily 05:00 local.
    const series = makeSeries({ freq: 'daily', timeZone: NY, startMinutes: 5 * 60 })
    const window: GenerationWindow = {
      from: new Date('2026-03-06T00:00:00.000Z'),
      to: new Date('2026-03-10T00:00:00.000Z'),
    }
    expect(starts(generateSeriesSeeds({ series, window }))).toEqual([
      iso('2026-03-06T10:00:00.000Z'), // EST (-5): 05:00 local
      iso('2026-03-07T10:00:00.000Z'), // EST (-5)
      iso('2026-03-08T09:00:00.000Z'), // EDT (-4): still 05:00 local
      iso('2026-03-09T09:00:00.000Z'), // EDT (-4)
    ])
  })

  it('keeps wall-clock startMinutes across the fall-back boundary', () => {
    // Fall back: 2026-11-01 02:00 local. Daily 05:00 local.
    const series = makeSeries({ freq: 'daily', timeZone: NY, startMinutes: 5 * 60 })
    const window: GenerationWindow = {
      from: new Date('2026-10-30T00:00:00.000Z'),
      to: new Date('2026-11-03T00:00:00.000Z'),
    }
    expect(starts(generateSeriesSeeds({ series, window }))).toEqual([
      iso('2026-10-30T09:00:00.000Z'), // EDT (-4): 05:00 local
      iso('2026-10-31T09:00:00.000Z'), // EDT (-4)
      iso('2026-11-01T10:00:00.000Z'), // EST (-5): still 05:00 local
      iso('2026-11-02T10:00:00.000Z'), // EST (-5)
    ])
  })
})
