import { describe, expect, it } from 'vitest'
import {
  DAY_TOKENS,
  DAYS_PER_WEEK,
  EXTEND_THRESHOLD_WEEKS,
  HORIZON_WEEKS,
  MS_PER_WEEK,
  SINGLE_OCCURRENCE,
  SINGLE_WEEK,
  SUPPORTED_RECURRENCES,
  buildIntervalRows,
  buildWeekdayRows,
  generateSeriesRows,
  resolveSeriesBaseStart,
  resolveSeriesWindow,
  sundayOfWeekUTC,
  weeksFromCount,
  type GenerateSeriesRowsArgs,
  type SeriesBaseFields,
} from '@/lib/series-generation'

function makeBase(overrides: Partial<SeriesBaseFields> = {}): SeriesBaseFields {
  return {
    userId: 'user-1',
    title: 'Test Task',
    type: 'task',
    recurrence: 'weekly',
    recurrenceGroupId: 'group-1',
    recurrenceDays: null,
    recurrenceCount: null,
    targetDate: null,
    location: null,
    description: null,
    color: null,
    allDay: false,
    ...overrides,
  }
}

function iso(s: string): string {
  return new Date(s).toISOString()
}

describe('constants', () => {
  it('exposes named window/horizon constants', () => {
    expect(HORIZON_WEEKS).toBe(8)
    expect(EXTEND_THRESHOLD_WEEKS).toBe(4)
    expect(MS_PER_WEEK).toBe(7 * 24 * 60 * 60 * 1000)
    expect(DAYS_PER_WEEK).toBe(7)
    expect(SINGLE_WEEK).toBe(1)
    expect(SINGLE_OCCURRENCE).toBe(1)
    expect(SUPPORTED_RECURRENCES).toEqual(['daily', 'weekly', 'monthly'])
    expect(DAY_TOKENS).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  })
})

describe('sundayOfWeekUTC', () => {
  it('maps a mid-week date to that week Sunday 00:00 UTC', () => {
    const midWeek = new Date('2025-01-08T15:30:00.000Z') // Wednesday
    expect(sundayOfWeekUTC(midWeek).toISOString()).toBe(iso('2025-01-05T00:00:00.000Z'))
  })

  it('maps a Sunday to itself (midnight-stamped)', () => {
    const sunday = new Date('2025-01-05T14:00:00.000Z')
    expect(sundayOfWeekUTC(sunday).toISOString()).toBe(iso('2025-01-05T00:00:00.000Z'))
  })
})

describe('resolveSeriesWindow', () => {
  it('counted: start = Sunday of seriesStart week, end = start + N weeks', () => {
    const seriesStart = new Date('2025-01-08T15:30:00.000Z')
    const now = new Date('2025-01-08T15:30:00.000Z')
    const window = resolveSeriesWindow(seriesStart, 3, now)
    expect(window.start.toISOString()).toBe(iso('2025-01-05T00:00:00.000Z'))
    expect(window.end.toISOString()).toBe(iso('2025-01-26T00:00:00.000Z'))
  })

  it('open-ended: end = now + 8 weeks', () => {
    const seriesStart = new Date('2025-01-08T15:30:00.000Z')
    const now = new Date('2025-02-01T00:00:00.000Z')
    const window = resolveSeriesWindow(seriesStart, null, now)
    expect(window.start.toISOString()).toBe(iso('2025-01-05T00:00:00.000Z'))
    expect(window.end.toISOString()).toBe(iso('2025-03-29T00:00:00.000Z'))
  })
})

describe('generateSeriesRows — weekly-days', () => {
  const window = {
    start: new Date('2025-01-05T00:00:00.000Z'),
    end: new Date('2025-01-19T00:00:00.000Z'), // 2 weeks
  }
  const template = {
    start: new Date('2025-01-08T14:30:00.000Z'), // Wed 14:30 UTC
    end: null,
  }

  function baseArgs(): GenerateSeriesRowsArgs {
    return {
      base: makeBase(),
      template,
      window,
      recurrence: 'weekly',
      selectedDows: [1, 3, 5],
      intervalCount: null,
      existingSlots: new Set(),
    }
  }

  it('emits 6 rows across 2 weeks, each stamped with the template UTC time-of-day, including a day earlier in the first week than the template date', () => {
    const rows = generateSeriesRows(baseArgs())
    const starts = rows.map((r) => r.startAt.toISOString())
    expect(starts).toEqual([
      iso('2025-01-06T14:30:00.000Z'), // Mon week 1 — earlier than template's Jan 8
      iso('2025-01-08T14:30:00.000Z'), // Wed week 1
      iso('2025-01-10T14:30:00.000Z'), // Fri week 1
      iso('2025-01-13T14:30:00.000Z'), // Mon week 2
      iso('2025-01-15T14:30:00.000Z'), // Wed week 2
      iso('2025-01-17T14:30:00.000Z'), // Fri week 2
    ])
    expect(rows.every((r) => r.endAt === null)).toBe(true)
  })

  it('dedupes a slot present in existingSlots, keeps the rest', () => {
    const args = baseArgs()
    const rows = generateSeriesRows({
      ...args,
      existingSlots: new Set([iso('2025-01-08T14:30:00.000Z')]),
    })
    const starts = rows.map((r) => r.startAt.toISOString())
    expect(starts).not.toContain(iso('2025-01-08T14:30:00.000Z'))
    expect(starts).toHaveLength(5)
  })

  it('drops rows at or before notBefore, keeps strictly-after rows', () => {
    const args = baseArgs()
    const rows = generateSeriesRows({
      ...args,
      notBefore: new Date('2025-01-08T14:30:00.000Z'),
    })
    const starts = rows.map((r) => r.startAt.toISOString())
    expect(starts).toEqual([
      iso('2025-01-10T14:30:00.000Z'),
      iso('2025-01-13T14:30:00.000Z'),
      iso('2025-01-15T14:30:00.000Z'),
      iso('2025-01-17T14:30:00.000Z'),
    ])
  })

  it('stamps time-of-day and duration across a cross-midnight template', () => {
    const rows = generateSeriesRows({
      base: makeBase(),
      template: {
        start: new Date('2025-01-08T22:00:00.000Z'),
        end: new Date('2025-01-09T01:00:00.000Z'), // 3h later, next UTC day
      },
      window: {
        start: new Date('2025-01-05T00:00:00.000Z'),
        end: new Date('2025-01-12T00:00:00.000Z'), // 1 week
      },
      recurrence: 'weekly',
      selectedDows: [3],
      intervalCount: null,
      existingSlots: new Set(),
    })
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.startAt.toISOString()).toBe(iso('2025-01-08T22:00:00.000Z'))
    expect(row.endAt?.toISOString()).toBe(iso('2025-01-09T01:00:00.000Z'))
    expect(row.endAt!.getTime() - row.startAt.getTime()).toBe(3 * 60 * 60 * 1000)
  })

  it('clips rows landing at/after window.end within the final week', () => {
    const rows = generateSeriesRows({
      base: makeBase(),
      template,
      window: {
        start: new Date('2025-01-05T00:00:00.000Z'),
        end: new Date('2025-01-15T00:00:00.000Z'), // mid-week cutoff (Wed)
      },
      recurrence: 'weekly',
      selectedDows: [1, 3, 5],
      intervalCount: null,
      existingSlots: new Set(),
    })
    const starts = rows.map((r) => r.startAt.toISOString())
    expect(starts).toEqual([
      iso('2025-01-06T14:30:00.000Z'),
      iso('2025-01-08T14:30:00.000Z'),
      iso('2025-01-10T14:30:00.000Z'),
      iso('2025-01-13T14:30:00.000Z'), // Mon week 2 still before cutoff
      // Wed/Fri week 2 (Jan 15, Jan 17) fall at/after window.end — clipped
    ])
  })
})

describe('generateSeriesRows — interval counted', () => {
  it('emits all N rows even when window.end is closer than N would reach (no clipping)', () => {
    const seriesStart = new Date('2025-01-05T00:00:00.000Z')
    const window = resolveSeriesWindow(seriesStart, null, seriesStart) // end = +8 weeks
    const rows = generateSeriesRows({
      base: makeBase(),
      template: { start: seriesStart, end: null },
      window,
      recurrence: 'weekly',
      selectedDows: null,
      intervalCount: 12,
      existingSlots: new Set(),
    })
    expect(rows).toHaveLength(12)
    expect(rows[11]!.startAt.toISOString()).toBe(iso('2025-03-23T00:00:00.000Z')) // +11 weeks, beyond window.end
  })

  it('applies dedupe and notBefore skips on counted rows', () => {
    const seriesStart = new Date('2025-01-05T00:00:00.000Z')
    const window = resolveSeriesWindow(seriesStart, null, seriesStart)
    const rows = generateSeriesRows({
      base: makeBase(),
      template: { start: seriesStart, end: null },
      window,
      recurrence: 'daily',
      selectedDows: null,
      intervalCount: 5,
      existingSlots: new Set([iso('2025-01-06T00:00:00.000Z')]),
      notBefore: new Date('2025-01-07T00:00:00.000Z'),
    })
    const starts = rows.map((r) => r.startAt.toISOString())
    // Jan5 (before notBefore), Jan6 (deduped), Jan7 (at notBefore) all dropped.
    expect(starts).toEqual([iso('2025-01-08T00:00:00.000Z'), iso('2025-01-09T00:00:00.000Z')])
  })
})

describe('generateSeriesRows — interval counted duration', () => {
  it('carries a non-null template.end stepped alongside each counted start', () => {
    const seriesStart = new Date('2025-01-05T09:00:00.000Z')
    const seriesEnd = new Date('2025-01-05T10:00:00.000Z')
    const window = resolveSeriesWindow(seriesStart, null, seriesStart)
    const rows = generateSeriesRows({
      base: makeBase(),
      template: { start: seriesStart, end: seriesEnd },
      window,
      recurrence: 'daily',
      selectedDows: null,
      intervalCount: 3,
      existingSlots: new Set(),
    })
    expect(rows.map((r) => r.endAt?.toISOString())).toEqual([
      iso('2025-01-05T10:00:00.000Z'),
      iso('2025-01-06T10:00:00.000Z'),
      iso('2025-01-07T10:00:00.000Z'),
    ])
  })
})

describe('generateSeriesRows — interval open-ended', () => {
  it('daily: emits rows until window.end, none at/after it', () => {
    const start = new Date('2025-01-05T00:00:00.000Z')
    const window = { start, end: new Date('2025-01-10T00:00:00.000Z') }
    const rows = generateSeriesRows({
      base: makeBase(),
      template: { start, end: null },
      window,
      recurrence: 'daily',
      selectedDows: null,
      intervalCount: null,
      existingSlots: new Set(),
    })
    const starts = rows.map((r) => r.startAt.toISOString())
    expect(starts).toEqual([
      iso('2025-01-05T00:00:00.000Z'),
      iso('2025-01-06T00:00:00.000Z'),
      iso('2025-01-07T00:00:00.000Z'),
      iso('2025-01-08T00:00:00.000Z'),
      iso('2025-01-09T00:00:00.000Z'),
    ])
    expect(starts.every((s) => new Date(s).getTime() < window.end.getTime())).toBe(true)
  })

  it('monthly: steps monthly until window.end', () => {
    const start = new Date('2025-01-05T00:00:00.000Z')
    const window = { start, end: new Date('2025-07-05T00:00:00.000Z') }
    const rows = generateSeriesRows({
      base: makeBase(),
      template: { start, end: null },
      window,
      recurrence: 'monthly',
      selectedDows: null,
      intervalCount: null,
      existingSlots: new Set(),
    })
    const starts = rows.map((r) => r.startAt.toISOString())
    expect(starts).toEqual([
      iso('2025-01-05T00:00:00.000Z'),
      iso('2025-02-05T00:00:00.000Z'),
      iso('2025-03-05T00:00:00.000Z'),
      iso('2025-04-05T00:00:00.000Z'),
      iso('2025-05-05T00:00:00.000Z'),
      iso('2025-06-05T00:00:00.000Z'),
    ])
  })

  it('applies dedupe skips and carries a non-null template.end while stepping open-ended', () => {
    const start = new Date('2025-01-05T09:00:00.000Z')
    const end = new Date('2025-01-05T10:00:00.000Z')
    const window = { start, end: new Date('2025-01-08T00:00:00.000Z') }
    const rows = generateSeriesRows({
      base: makeBase(),
      template: { start, end },
      window,
      recurrence: 'daily',
      selectedDows: null,
      intervalCount: null,
      existingSlots: new Set([iso('2025-01-06T09:00:00.000Z')]),
    })
    expect(rows.map((r) => r.startAt.toISOString())).toEqual([
      iso('2025-01-05T09:00:00.000Z'),
      iso('2025-01-07T09:00:00.000Z'),
    ])
    expect(rows.map((r) => r.endAt?.toISOString())).toEqual([
      iso('2025-01-05T10:00:00.000Z'),
      iso('2025-01-07T10:00:00.000Z'),
    ])
  })
})

describe('moved helpers — weeksFromCount', () => {
  it('returns SINGLE_WEEK when recurrenceCount is undefined', () => {
    expect(weeksFromCount(undefined)).toBe(SINGLE_WEEK)
  })

  it('returns SINGLE_WEEK when recurrenceCount is 1 (not > SINGLE_WEEK)', () => {
    expect(weeksFromCount(1)).toBe(SINGLE_WEEK)
  })

  it('returns recurrenceCount when it exceeds SINGLE_WEEK', () => {
    expect(weeksFromCount(4)).toBe(4)
  })
})

describe('moved helpers — resolveSeriesBaseStart', () => {
  it('keeps the anchor start when it is in the future', () => {
    const anchor = new Date('2025-06-01T10:00:00.000Z')
    const now = new Date('2025-01-01T00:00:00.000Z')
    expect(resolveSeriesBaseStart(anchor, now).toISOString()).toBe(anchor.toISOString())
  })

  it('re-anchors to the week of now when the anchor is at/before now', () => {
    const anchor = new Date('2025-01-01T10:00:00.000Z')
    const now = new Date('2025-06-15T00:00:00.000Z')
    const result = resolveSeriesBaseStart(anchor, now)
    expect(result.getUTCFullYear()).toBe(2025)
    expect(result.getUTCMonth()).toBe(5) // June
    expect(result.getUTCDate()).toBe(15)
    expect(result.getUTCHours()).toBe(10)
  })
})

describe('moved helpers — buildWeekdayRows', () => {
  it('fans out with a null baseEnd (no endAt on rows)', () => {
    const base = makeBase()
    const baseStart = new Date('2025-01-08T14:30:00.000Z') // Wed
    const rows = buildWeekdayRows(base, baseStart, null, [1, 5], 1)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.endAt === null)).toBe(true)
  })

  it('fans out with a baseEnd (endAt shifted alongside startAt)', () => {
    const base = makeBase()
    const baseStart = new Date('2025-01-08T14:30:00.000Z')
    const baseEnd = new Date('2025-01-08T15:30:00.000Z')
    const rows = buildWeekdayRows(base, baseStart, baseEnd, [1, 5], 1)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.endAt).not.toBeNull()
      expect(row.endAt!.getTime() - row.startAt.getTime()).toBe(60 * 60 * 1000)
    }
  })
})

describe('moved helpers — buildIntervalRows', () => {
  const base = makeBase()

  it('steps daily and shifts a non-null end alongside start', () => {
    const rows = buildIntervalRows(
      base,
      'daily',
      new Date('2025-01-05T00:00:00.000Z'),
      new Date('2025-01-05T01:00:00.000Z'),
      3,
    )
    expect(rows.map((r) => r.startAt.toISOString())).toEqual([
      iso('2025-01-05T00:00:00.000Z'),
      iso('2025-01-06T00:00:00.000Z'),
      iso('2025-01-07T00:00:00.000Z'),
    ])
    expect(rows.map((r) => r.endAt?.toISOString())).toEqual([
      iso('2025-01-05T01:00:00.000Z'),
      iso('2025-01-06T01:00:00.000Z'),
      iso('2025-01-07T01:00:00.000Z'),
    ])
  })

  it('steps weekly with a null end', () => {
    const rows = buildIntervalRows(base, 'weekly', new Date('2025-01-05T00:00:00.000Z'), null, 2)
    expect(rows.map((r) => r.startAt.toISOString())).toEqual([
      iso('2025-01-05T00:00:00.000Z'),
      iso('2025-01-12T00:00:00.000Z'),
    ])
    expect(rows.every((r) => r.endAt === null)).toBe(true)
  })

  it('steps weekly and shifts a non-null end', () => {
    const rows = buildIntervalRows(
      base,
      'weekly',
      new Date('2025-01-05T00:00:00.000Z'),
      new Date('2025-01-05T01:00:00.000Z'),
      2,
    )
    expect(rows.map((r) => r.endAt?.toISOString())).toEqual([
      iso('2025-01-05T01:00:00.000Z'),
      iso('2025-01-12T01:00:00.000Z'),
    ])
  })

  it('steps monthly with a null end', () => {
    const rows = buildIntervalRows(base, 'monthly', new Date('2025-01-05T00:00:00.000Z'), null, 2)
    expect(rows.map((r) => r.startAt.toISOString())).toEqual([
      iso('2025-01-05T00:00:00.000Z'),
      iso('2025-02-05T00:00:00.000Z'),
    ])
    expect(rows.every((r) => r.endAt === null)).toBe(true)
  })

  it('steps monthly and shifts a non-null end', () => {
    const rows = buildIntervalRows(
      base,
      'monthly',
      new Date('2025-01-05T00:00:00.000Z'),
      new Date('2025-01-05T01:00:00.000Z'),
      2,
    )
    expect(rows.map((r) => r.endAt?.toISOString())).toEqual([
      iso('2025-01-05T01:00:00.000Z'),
      iso('2025-02-05T01:00:00.000Z'),
    ])
  })

  it('steps daily with a null end', () => {
    const rows = buildIntervalRows(base, 'daily', new Date('2025-01-05T00:00:00.000Z'), null, 2)
    expect(rows.every((r) => r.endAt === null)).toBe(true)
  })
})
