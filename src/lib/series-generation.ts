// Pure TZ-aware series-generation core for the `event_series` → `events`
// sliding window (wave 4 event-level recurrence). No server dependencies
// (auth/db) — every export here is a plain function/constant so it can be
// unit-tested without mocking, and reused by any server action that needs to
// generate a series' upcoming events. Replaces `event-generation.ts` (the
// activity-schedule core, retired at A3) with day-iteration over any of the
// four recurrence frequencies instead of week-anchor iteration over slots.
const DAYS_PER_WEEK = 7
const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND

/** Milliseconds in one week — the shared unit for window math. */
const MS_PER_WEEK: number =
  DAYS_PER_WEEK * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND

// Sentinel nth-ordinal that selects the LAST occurrence of a weekday in a month.
const LAST_ORDINAL = -1

// Sliding-window horizon: how far past `now` a generation sweep fans a series
// out.
export const HORIZON_WEEKS = 8

// Zone used when a series has no `timeZone` — recurrence wall-clock is read as
// UTC (no offset correction). `Intl` resolves 'UTC' with a constant zero
// offset, so this shares the same TZ-aware code path as a real IANA zone
// rather than needing a separate branch.
const DEFAULT_TIME_ZONE = 'UTC'

// High-water mark floor when a series has never generated before — every real
// slotStart is strictly after this.
const EPOCH = new Date(0)

export interface GenerationWindow {
  readonly from: Date
  readonly to: Date
}

export interface GeneratedEventSeed {
  readonly title: string
  readonly description: string | null
  readonly location: string | null
  readonly color: string | null
  readonly startAt: Date
  readonly endAt: Date
}

// Slim projection of an `event_series` row — only the fields generation reads.
export interface GenerationSeries {
  readonly title: string
  readonly description: string | null
  readonly location: string | null
  readonly color: string | null
  readonly freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  readonly weekdays: readonly number[] | null
  readonly dayOfMonth: number | null
  readonly nthOrdinal: number | null
  readonly nthWeekday: number | null
  readonly month: number | null
  readonly startMinutes: number
  readonly durationMin: number
  readonly timeZone: string | null
  readonly until: Date | null
  readonly generatedThrough: Date | null
}

export interface GenerateSeriesSeedsArgs {
  readonly series: GenerationSeries
  readonly window: GenerationWindow
  /**
   * Millisecond timestamps of the series' existing PENDING events. A slot
   * landing exactly on one is skipped, so a rule-edit regeneration (which
   * resets `generatedThrough` to now) never re-creates an event for a day that
   * already has one. Omit for the plain first-generation path.
   */
  readonly existingStartAtMs?: ReadonlySet<number>
}

/** window.from = now, window.to = now + HORIZON_WEEKS weeks. */
export function resolveGenerationWindow(now: Date): GenerationWindow {
  return {
    from: new Date(now.getTime()),
    to: new Date(now.getTime() + HORIZON_WEEKS * MS_PER_WEEK),
  }
}

/**
 * High-water mark to advance a series' `generatedThrough` to after a sweep:
 * min(window.to, until). A fully-elapsed bounded series pins its mark at
 * `until` and never generates again.
 */
export function nextGeneratedThrough(window: GenerationWindow, until: Date | null): Date {
  const to = window.to.getTime()
  return new Date(until === null ? to : Math.min(to, until.getTime()))
}

// ─── TZ-aware wall-clock ↔ UTC construction ────────────────────────────────
// Ported VERBATIM from src/lib/event-generation.ts:93-173 (retired at A3). No
// new dependency: Intl.DateTimeFormat (Node ships full ICU) resolves a zone's
// offset at any instant, which is all that's needed to convert a local
// wall-clock to a UTC instant across DST.

interface WallClock {
  readonly year: number
  readonly month: number // 0-based, to match Date.UTC
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

/** Local wall-clock (calendar + time-of-day) of a UTC instant in `timeZone`. */
function zonedWallClock(timeZone: string, instant: Date): WallClock {
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
  // Non-null: the fixed set of options above always yields every part below —
  // no defensive fallback branch needed (guaranteed by Intl's contract, not
  // by any external input this module receives).
  const get = (type: string): number => Number(parts.find((p) => p.type === type)!.value)
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

// ─── Recurrence rule matching ──────────────────────────────────────────────

// Days in a (year, 0-based month) — Date.UTC day 0 of the next month rolls back
// to the last day of this one.
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

// Day-of-month for a monthly/yearly rule, clamped to the month's length — one
// clamp covers 31st→short months AND Feb 29→28.
function clampDayOfMonth(year: number, month: number, dayOfMonth: number): number {
  return Math.min(dayOfMonth, daysInMonth(year, month))
}

// Calendar day of the nth `weekday` in a (year, 0-based month). Ordinal 1–4 =
// the nth occurrence; LAST_ORDINAL (-1) = the last occurrence.
function nthWeekdayDate(year: number, month: number, ordinal: number, weekday: number): number {
  if (ordinal === LAST_ORDINAL) {
    const lastDay = daysInMonth(year, month)
    const lastWeekday = localWeekday(year, month, lastDay)
    return lastDay - ((lastWeekday - weekday + DAYS_PER_WEEK) % DAYS_PER_WEEK)
  }
  const firstWeekday = localWeekday(year, month, 1)
  const firstDate = 1 + ((weekday - firstWeekday + DAYS_PER_WEEK) % DAYS_PER_WEEK)
  return firstDate + (ordinal - 1) * DAYS_PER_WEEK
}

// Whether a local calendar day satisfies the series' recurrence rule.
function matchesRule(series: GenerationSeries, year: number, month: number, day: number): boolean {
  switch (series.freq) {
    case 'daily':
      return true
    case 'weekly':
      return series.weekdays!.includes(localWeekday(year, month, day))
    case 'monthly':
      if (series.dayOfMonth !== null) {
        return day === clampDayOfMonth(year, month, series.dayOfMonth)
      }
      return day === nthWeekdayDate(year, month, series.nthOrdinal!, series.nthWeekday!)
    case 'yearly':
      return month === series.month! - 1 && day === clampDayOfMonth(year, month, series.dayOfMonth!)
  }
}

/**
 * Every seed the series produces for `window`, TZ-aware and high-water gated.
 * Walks each local calendar day (in `series.timeZone`, UTC fallback when null)
 * from the window's start; for a day matching the recurrence rule, places the
 * event at the day's wall-clock `startMinutes`, converts to a UTC instant, and
 * includes it only when it lands strictly after `generatedThrough`, within
 * [window.from, window.to), at or before `until`, and not already present.
 */
export function generateSeriesSeeds(args: GenerateSeriesSeedsArgs): GeneratedEventSeed[] {
  const { series, window, existingStartAtMs } = args
  const timeZone = series.timeZone ?? DEFAULT_TIME_ZONE
  const highWaterMark = series.generatedThrough ?? EPOCH
  const hour = Math.floor(series.startMinutes / MINUTES_PER_HOUR)
  const minute = series.startMinutes % MINUTES_PER_HOUR
  const seeds: GeneratedEventSeed[] = []

  let cursor: { year: number; month: number; day: number } = zonedWallClock(timeZone, window.from)
  for (;;) {
    const dayStartUtc = wallClockToUtc(timeZone, cursor.year, cursor.month, cursor.day, 0, 0, 0, 0)
    if (dayStartUtc.getTime() >= window.to.getTime()) break

    if (matchesRule(series, cursor.year, cursor.month, cursor.day)) {
      const slotStart = wallClockToUtc(
        timeZone,
        cursor.year,
        cursor.month,
        cursor.day,
        hour,
        minute,
        0,
        0,
      )
      const t = slotStart.getTime()
      if (
        t > highWaterMark.getTime() &&
        t >= window.from.getTime() &&
        t < window.to.getTime() &&
        (series.until === null || t <= series.until.getTime()) &&
        !existingStartAtMs?.has(t)
      ) {
        seeds.push({
          title: series.title,
          description: series.description,
          location: series.location,
          color: series.color,
          startAt: slotStart,
          endAt: new Date(t + series.durationMin * MS_PER_MINUTE),
        })
      }
    }

    cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1)
  }

  return seeds
}
