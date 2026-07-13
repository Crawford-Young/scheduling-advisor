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
  // IANA zone the series is anchored in. Non-null → weekly-days generation lands
  // occurrences on the correct LOCAL weekday/wall-clock (DST-correct). Null →
  // legacy UTC day math (fallback, byte-for-byte with pre-S12 behavior).
  readonly timeZone: string | null
}

// ─── TZ-aware wall-clock ↔ UTC construction (wave 2.6 S12) ────────────────────
// No new dependency: Intl.DateTimeFormat (Node ships full ICU) resolves the
// zone's offset at any instant, which is all we need to convert a local
// wall-clock to a UTC instant across DST.

interface WallClock {
  readonly year: number
  readonly month: number // 0-based, to match Date.UTC
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

// Local wall-clock (calendar + time-of-day) of a UTC instant in `timeZone`.
// Exported for reuse by consumers that need a TZ-aware calendar-day boundary
// without duplicating the Intl math (streaks.ts wave 2.6 S13).
export function zonedWallClock(timeZone: string, instant: Date): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0')
  // Some ICU builds render midnight as hour 24 under hour12:false.
  const hour = get('hour') % HOURS_PER_DAY
  return {
    year: get('year'),
    month: get('month') - 1,
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  }
}

// Offset (ms) such that localWallClock = utc + offset, at `instant` in `timeZone`.
// Zone offsets are whole minutes, so comparing/subtracting at second precision is
// exact.
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const wc = zonedWallClock(timeZone, instant)
  const asUtc = Date.UTC(wc.year, wc.month, wc.day, wc.hour, wc.minute, wc.second)
  const instantSec = Math.floor(instant.getTime() / MS_PER_SECOND) * MS_PER_SECOND
  return asUtc - instantSec
}

// UTC instant whose LOCAL wall-clock in `timeZone` equals the given components.
// Two-pass guess-and-correct: guess by treating the wall-clock as UTC, resolve
// the offset at that guess, correct, then re-resolve once (handles a DST offset
// change straddling the guess).
function wallClockToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
): Date {
  const guess = Date.UTC(year, month, day, hour, minute, second, ms)
  const offset1 = zoneOffsetMs(timeZone, new Date(guess))
  const corrected = guess - offset1
  const offset2 = zoneOffsetMs(timeZone, new Date(corrected))
  return new Date(offset2 === offset1 ? corrected : guess - offset2)
}

// Weekday (0 = Sunday) of a local calendar date — Date.UTC as a pure calendar proxy.
function localWeekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month, day)).getUTCDay()
}

// Adds `n` calendar days to a local (y, m, d), normalizing month/year rollover.
function addCalendarDays(
  year: number,
  month: number,
  day: number,
  n: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month, day + n))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() }
}

/** Local Sunday 00:00 of `d`'s week in `timeZone`, as a UTC instant. */
export function sundayOfWeekZoned(d: Date, timeZone: string): Date {
  const wc = zonedWallClock(timeZone, d)
  const weekday = localWeekday(wc.year, wc.month, wc.day)
  const sun = addCalendarDays(wc.year, wc.month, wc.day, -weekday)
  return wallClockToUtc(timeZone, sun.year, sun.month, sun.day, 0, 0, 0, 0)
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
  if (base.timeZone != null) {
    return buildWeekdayRowsZoned(base, baseStart, baseEnd, selectedDows, weeks, base.timeZone)
  }
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

// TZ-aware buildWeekdayRows: each token lands on its LOCAL weekday within
// baseStart's LOCAL week, at baseStart's LOCAL wall-clock time-of-day, converted
// back to a UTC instant per-occurrence (so DST offset changes never drift the
// wall-clock). Duration is preserved in ms.
function buildWeekdayRowsZoned(
  base: SeriesBaseFields,
  baseStart: Date,
  baseEnd: Date | null,
  selectedDows: readonly number[],
  weeks: number,
  timeZone: string,
): GeneratedRow[] {
  const rows: GeneratedRow[] = []
  const wc = zonedWallClock(timeZone, baseStart)
  const ms = baseStart.getUTCMilliseconds()
  const baseDow = localWeekday(wc.year, wc.month, wc.day)
  const durationMs = baseEnd ? baseEnd.getTime() - baseStart.getTime() : null
  for (let week = 0; week < weeks; week++) {
    for (const dow of selectedDows) {
      const shift = dow - baseDow + week * DAYS_PER_WEEK
      const local = addCalendarDays(wc.year, wc.month, wc.day, shift)
      const start = wallClockToUtc(
        timeZone,
        local.year,
        local.month,
        local.day,
        wc.hour,
        wc.minute,
        wc.second,
        ms,
      )
      const end = durationMs === null ? null : new Date(start.getTime() + durationMs)
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
 * start = week-Sunday 00:00 of seriesStart — LOCAL to `timeZone` when provided
 * (as a UTC instant), else UTC (fallback).
 * weeklyDaysCount != null → end = start + weeklyDaysCount * MS_PER_WEEK
 * weeklyDaysCount == null (open-ended) → end = now + HORIZON_WEEKS * MS_PER_WEEK
 */
export function resolveSeriesWindow(
  seriesStart: Date,
  weeklyDaysCount: number | null,
  now: Date,
  timeZone: string | null = null,
): SeriesWindow {
  const start =
    timeZone != null ? sundayOfWeekZoned(seriesStart, timeZone) : sundayOfWeekUTC(seriesStart)
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
  if (base.timeZone != null) {
    return generateWeeklyDaysRowsZoned(
      base,
      template,
      window,
      selectedDows,
      base.timeZone,
      existingSlots,
      notBefore,
    )
  }
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

// TZ-aware weekly-days: iterate LOCAL weeks from the LOCAL Sunday of window.start,
// placing each token at the anchor's LOCAL wall-clock time-of-day and converting
// to a UTC instant per-occurrence (DST-correct). window.end (a UTC instant) still
// bounds the week loop and clips a trailing partial week.
function generateWeeklyDaysRowsZoned(
  base: SeriesBaseFields,
  template: SeriesTemplate,
  window: SeriesWindow,
  selectedDows: readonly number[],
  timeZone: string,
  existingSlots: ReadonlySet<string>,
  notBefore: Date | undefined,
): GeneratedRow[] {
  const rows: GeneratedRow[] = []
  const time = zonedWallClock(timeZone, template.start)
  const timeMs = template.start.getUTCMilliseconds()
  const durationMs = template.end ? template.end.getTime() - template.start.getTime() : null
  const ws = zonedWallClock(timeZone, window.start)
  const sunday0 = addCalendarDays(
    ws.year,
    ws.month,
    ws.day,
    -localWeekday(ws.year, ws.month, ws.day),
  )
  for (let week = 0; ; week++) {
    const weekSunday = addCalendarDays(
      sunday0.year,
      sunday0.month,
      sunday0.day,
      week * DAYS_PER_WEEK,
    )
    const weekSundayUtc = wallClockToUtc(
      timeZone,
      weekSunday.year,
      weekSunday.month,
      weekSunday.day,
      0,
      0,
      0,
      0,
    )
    if (weekSundayUtc.getTime() >= window.end.getTime()) break
    for (const dow of selectedDows) {
      const local = addCalendarDays(
        sunday0.year,
        sunday0.month,
        sunday0.day,
        week * DAYS_PER_WEEK + dow,
      )
      const start = wallClockToUtc(
        timeZone,
        local.year,
        local.month,
        local.day,
        time.hour,
        time.minute,
        time.second,
        timeMs,
      )
      if (start.getTime() >= window.end.getTime()) continue
      if (isSkippedSlot(start, existingSlots, notBefore)) continue
      const end = durationMs === null ? null : new Date(start.getTime() + durationMs)
      rows.push({ ...base, startAt: start, endAt: end })
    }
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
