// Pure recurrence fan-out math for the `tasks` table. No server dependencies
// (auth/db/ratelimit) — every export here is a plain function/constant so it
// can be unit-tested without mocking, and reused by any server action that
// needs to generate or window a recurrence series.
import { tasks } from '@/db/schema'
import type { DayOfWeek } from '@/lib/schemas/task'

type TaskInsert = (typeof tasks)['$inferInsert']

// A fanned-out occurrence always carries a concrete startAt, which lets callers
// key on it (e.g. the survivor-slot dedupe in updateSeries' pattern-rewrite path,
// src/server/actions/series-mutations.ts) without a re-guard.
export type GeneratedRow = TaskInsert & { readonly startAt: Date; readonly endAt: Date | null }

export const SUPPORTED_RECURRENCES = ['daily', 'weekly', 'monthly'] as const

// Index of each weekday token — must match Date#getUTCDay (0 = Sunday). Mirrors
// the library's DAY_ABBR ordering so recurrenceDays map to the right column.
export const DAY_TOKENS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const DAYS_PER_WEEK = 7
export const SINGLE_WEEK = 1
// Distinct from SINGLE_WEEK: this is a fallback occurrence COUNT (buildIntervalRows'
// `count` param), not a week count — same numeric value, different unit.
export const SINGLE_OCCURRENCE = 1

const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000

/** Milliseconds in one week — the shared unit for window math. */
export const MS_PER_WEEK: number =
  DAYS_PER_WEEK * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND

// Window horizon (§3 of the wave 2.6 spec) for open-ended series: how far past
// `now` an open-ended interval series' window extends.
export const HORIZON_WEEKS = 8
// Auto-extend threshold (consumed by later wave 2.6 tasks): how close to a
// series window's end triggers a fresh generation pass.
export const EXTEND_THRESHOLD_WEEKS = 4

// Weeks to fan a weekday pattern out over: `recurrenceCount` when it specifies
// more than one week, else a single week. Shared by createTask's weekday
// fan-out and updateSeries' materialize/regenerate paths (src/server/actions/
// series-mutations.ts).
export function weeksFromCount(recurrenceCount: number | undefined): number {
  return recurrenceCount !== undefined && recurrenceCount > SINGLE_WEEK
    ? recurrenceCount
    : SINGLE_WEEK
}

// The base date `buildWeekdayRows`/`buildIntervalRows` fan out from. When the
// anchor's own occurrence is still in the future, generation must start from
// the anchor's OWN week — re-anchoring to the week of `now` would fan out a
// month (or more) away from where the anchor actually lives. When the anchor
// is at/before `now`, keep the existing "this and following" re-anchor to the
// week of `now`, so regenerating an old series only ever creates upcoming
// rows, never backdated ones.
export function resolveSeriesBaseStart(anchorStart: Date, now: Date): Date {
  if (anchorStart.getTime() > now.getTime()) {
    return new Date(anchorStart)
  }
  const baseStart = new Date(anchorStart)
  baseStart.setUTCFullYear(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return baseStart
}

// Fields shared by every row of a recurrence group; the fan-out helpers stamp
// startAt/endAt onto copies of this base.
export interface SeriesBaseFields {
  readonly userId: string
  readonly title: string
  readonly type: TaskInsert['type']
  readonly recurrence: string | null
  readonly recurrenceGroupId: string
  readonly recurrenceDays: readonly DayOfWeek[] | null
  readonly recurrenceCount: number | null
  readonly targetDate: Date | null
  readonly location: string | null
  readonly description: string | null
  readonly color: string | null
  readonly allDay: boolean
}

// Weekly multi-day fan-out: one row per selected weekday, anchored to that
// weekday within `baseStart`'s week and repeated over `weeks` weeks. Times are
// carried from baseStart/baseEnd.
export function buildWeekdayRows(
  base: SeriesBaseFields,
  baseStart: Date,
  baseEnd: Date | null,
  selectedDows: readonly number[],
  weeks: number,
): GeneratedRow[] {
  const rows: GeneratedRow[] = []
  const baseDow = baseStart.getUTCDay()
  for (let week = 0; week < weeks; week++) {
    for (const dow of selectedDows) {
      const dayShift = dow - baseDow + week * DAYS_PER_WEEK
      const start = new Date(baseStart)
      start.setUTCDate(start.getUTCDate() + dayShift)
      let end: Date | null = null
      if (baseEnd) {
        end = new Date(baseEnd)
        end.setUTCDate(end.getUTCDate() + dayShift)
      }
      rows.push({ ...base, startAt: start, endAt: end })
    }
  }
  return rows
}

// Interval fan-out: `count` occurrences stepping by the daily/weekly/monthly
// recurrence from baseStart, times carried from baseStart/baseEnd.
export function buildIntervalRows(
  base: SeriesBaseFields,
  recurrence: string,
  baseStart: Date,
  baseEnd: Date | null,
  count: number,
): GeneratedRow[] {
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(baseStart)
    const end = baseEnd ? new Date(baseEnd) : null
    if (recurrence === 'daily') {
      start.setUTCDate(start.getUTCDate() + i)
      if (end) end.setUTCDate(end.getUTCDate() + i)
    } else if (recurrence === 'weekly') {
      start.setUTCDate(start.getUTCDate() + i * DAYS_PER_WEEK)
      if (end) end.setUTCDate(end.getUTCDate() + i * DAYS_PER_WEEK)
    } else {
      start.setUTCMonth(start.getUTCMonth() + i)
      if (end) end.setUTCMonth(end.getUTCMonth() + i)
    }
    return { ...base, startAt: start, endAt: end }
  })
}

/** UTC Sunday 00:00:00.000 of d's week. */
export function sundayOfWeekUTC(d: Date): Date {
  const sunday = new Date(d)
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay())
  sunday.setUTCHours(0, 0, 0, 0)
  return sunday
}

export interface SeriesWindow {
  readonly start: Date
  readonly end: Date
}

/**
 * start = sundayOfWeekUTC(seriesStart).
 * weeklyDaysCount != null → end = start + weeklyDaysCount * MS_PER_WEEK
 * weeklyDaysCount == null (open-ended) → end = now + HORIZON_WEEKS * MS_PER_WEEK
 */
export function resolveSeriesWindow(
  seriesStart: Date,
  weeklyDaysCount: number | null,
  now: Date,
): SeriesWindow {
  const start = sundayOfWeekUTC(seriesStart)
  const end =
    weeklyDaysCount !== null
      ? new Date(start.getTime() + weeklyDaysCount * MS_PER_WEEK)
      : new Date(now.getTime() + HORIZON_WEEKS * MS_PER_WEEK)
  return { start, end }
}

export interface GenerateSeriesRowsArgs {
  readonly base: SeriesBaseFields
  /** UTC time-of-day + duration source. */
  readonly template: { readonly start: Date; readonly end: Date | null }
  readonly window: SeriesWindow
  readonly recurrence: 'daily' | 'weekly' | 'monthly'
  /** Non-null = weekly-days path (getUTCDay indices, sorted). */
  readonly selectedDows: readonly number[] | null
  /** Interval paths: occurrence count (counted) or null (open-ended → fill window). */
  readonly intervalCount: number | null
  /** startAt ISO strings of ALL surviving rows — matching slots are skipped. */
  readonly existingSlots: ReadonlySet<string>
  /** Auto-extend: only emit rows with startAt strictly AFTER this. */
  readonly notBefore?: Date
}

type SeriesTemplate = GenerateSeriesRowsArgs['template']
type SeriesRecurrence = GenerateSeriesRowsArgs['recurrence']

// Shared skip predicate for dedupe + auto-extend cutoff, applied identically
// across all three generation paths.
function isSkippedSlot(
  start: Date,
  existingSlots: ReadonlySet<string>,
  notBefore: Date | undefined,
): boolean {
  if (existingSlots.has(start.toISOString())) return true
  if (notBefore !== undefined && start.getTime() <= notBefore.getTime()) return true
  return false
}

// Steps a UTC instant by `i` daily/weekly/monthly units — the same date math
// as buildIntervalRows, factored so both the counted and open-ended interval
// paths (which don't share buildIntervalRows' fixed `count` loop shape) apply
// it identically to a row's start and end.
function stepIntervalDate(d: Date, recurrence: SeriesRecurrence, i: number): Date {
  const stepped = new Date(d)
  if (recurrence === 'daily') {
    stepped.setUTCDate(stepped.getUTCDate() + i)
  } else if (recurrence === 'weekly') {
    stepped.setUTCDate(stepped.getUTCDate() + i * DAYS_PER_WEEK)
  } else {
    stepped.setUTCMonth(stepped.getUTCMonth() + i)
  }
  return stepped
}

// Weekly-days: every week Sunday in [window.start, window.end), every
// selected weekday of it — including days earlier in a week than the
// template's own date (no future-only filter). window.end still clips a
// trailing partial week.
function generateWeeklyDaysRows(
  base: SeriesBaseFields,
  template: SeriesTemplate,
  window: SeriesWindow,
  selectedDows: readonly number[],
  existingSlots: ReadonlySet<string>,
  notBefore: Date | undefined,
): GeneratedRow[] {
  const rows: GeneratedRow[] = []
  let weekSunday = new Date(window.start)
  while (weekSunday.getTime() < window.end.getTime()) {
    for (const dow of selectedDows) {
      const start = new Date(weekSunday)
      start.setUTCDate(start.getUTCDate() + dow)
      start.setUTCHours(
        template.start.getUTCHours(),
        template.start.getUTCMinutes(),
        template.start.getUTCSeconds(),
        template.start.getUTCMilliseconds(),
      )
      if (start.getTime() >= window.end.getTime()) continue
      if (isSkippedSlot(start, existingSlots, notBefore)) continue
      const end = template.end
        ? new Date(start.getTime() + (template.end.getTime() - template.start.getTime()))
        : null
      rows.push({ ...base, startAt: start, endAt: end })
    }
    weekSunday = new Date(weekSunday.getTime() + MS_PER_WEEK)
  }
  return rows
}

// Interval counted: exactly `intervalCount` occurrences stepping from
// template.start — window.end never clips a counted series.
function generateIntervalCountedRows(
  base: SeriesBaseFields,
  template: SeriesTemplate,
  recurrence: SeriesRecurrence,
  intervalCount: number,
  existingSlots: ReadonlySet<string>,
  notBefore: Date | undefined,
): GeneratedRow[] {
  const rows: GeneratedRow[] = []
  for (let i = 0; i < intervalCount; i++) {
    const start = stepIntervalDate(template.start, recurrence, i)
    if (isSkippedSlot(start, existingSlots, notBefore)) continue
    const end = template.end ? stepIntervalDate(template.end, recurrence, i) : null
    rows.push({ ...base, startAt: start, endAt: end })
  }
  return rows
}

// Interval open-ended: step from template.start until a row would land at/after
// window.end.
function generateIntervalOpenEndedRows(
  base: SeriesBaseFields,
  template: SeriesTemplate,
  window: SeriesWindow,
  recurrence: SeriesRecurrence,
  existingSlots: ReadonlySet<string>,
  notBefore: Date | undefined,
): GeneratedRow[] {
  const rows: GeneratedRow[] = []
  for (let i = 0; ; i++) {
    const start = stepIntervalDate(template.start, recurrence, i)
    if (start.getTime() >= window.end.getTime()) break
    if (!isSkippedSlot(start, existingSlots, notBefore)) {
      const end = template.end ? stepIntervalDate(template.end, recurrence, i) : null
      rows.push({ ...base, startAt: start, endAt: end })
    }
  }
  return rows
}

export function generateSeriesRows(args: GenerateSeriesRowsArgs): GeneratedRow[] {
  const {
    base,
    template,
    window,
    recurrence,
    selectedDows,
    intervalCount,
    existingSlots,
    notBefore,
  } = args
  if (selectedDows !== null) {
    return generateWeeklyDaysRows(base, template, window, selectedDows, existingSlots, notBefore)
  }
  if (intervalCount !== null) {
    return generateIntervalCountedRows(
      base,
      template,
      recurrence,
      intervalCount,
      existingSlots,
      notBefore,
    )
  }
  return generateIntervalOpenEndedRows(base, template, window, recurrence, existingSlots, notBefore)
}
