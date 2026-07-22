// Pure TZ-aware event-generation core for the `activities` → `events` sliding
// window (wave 3 activity model). No server dependencies (auth/db) — every
// export here is a plain function/constant so it can be unit-tested without
// mocking, and reused by any server action that needs to generate an
// activity's upcoming events. Mirrors the extendSeries pattern in
// series-generation.ts, which this module replaces at A8.
import type { ActivityScheduleSlot } from '@/lib/schemas/activity'

const DAYS_PER_WEEK = 7
const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND

/** Milliseconds in one week — the shared unit for window math. */
const MS_PER_WEEK: number =
  DAYS_PER_WEEK * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND

// Sliding-window horizon: how far past `now` a generation sweep fans an
// activity's schedule out.
export const HORIZON_WEEKS = 8

// Zone used when an activity has no `timeZone` — schedule minutes are read as
// UTC wall-clock (no offset correction). `Intl` resolves 'UTC' with a
// constant zero offset, so this shares the same TZ-aware code path as a real
// IANA zone rather than needing a separate branch.
const DEFAULT_TIME_ZONE = 'UTC'

// High-water mark floor when an activity has never generated before —
// every real slotStart is strictly after this.
const EPOCH = new Date(0)

export interface GenerationWindow {
  readonly from: Date
  readonly to: Date
}

export interface GeneratedEventSeed {
  readonly title: string
  readonly description: string | null
  readonly location: string | null
  readonly locationLat: number | null
  readonly locationLng: number | null
  readonly color: string | null
  readonly startAt: Date
  readonly endAt: Date
}

// Slim projection of an `activities` row — only the fields generation reads.
export interface GenerationActivity {
  readonly title: string
  readonly description: string | null
  readonly defaultLocation: string | null
  readonly locationLat: number | null
  readonly locationLng: number | null
  readonly color: string | null
  readonly schedule: readonly ActivityScheduleSlot[]
  readonly timeZone: string | null
  readonly generatedThrough: Date | null
}

export interface GenerateEventSeedsArgs {
  readonly activity: GenerationActivity
  readonly window: GenerationWindow
  /**
   * Millisecond timestamps of the activity's existing PENDING events. A slot
   * landing exactly on one is skipped, so a pattern-edit regeneration (which
   * resets `generatedThrough` to now) never re-creates an event for a day that
   * already has one. Omit for the plain first-generation path. Changed-day
   * stale events are NOT removed here — the guard only prevents duplicates
   * (forward-only pick; stray events are hand-deleted).
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

/** High-water mark to advance an activity's `generatedThrough` to after a sweep. */
export function nextGeneratedThrough(window: GenerationWindow): Date {
  return new Date(window.to.getTime())
}

// ─── TZ-aware wall-clock ↔ UTC construction ────────────────────────────────
// Ported from src/lib/series-generation.ts (which dies at A8 — this is an
// intentional, temporary duplication rather than an import, per the task
// brief). No new dependency: Intl.DateTimeFormat (Node ships full ICU)
// resolves a zone's offset at any instant, which is all that's needed to
// convert a local wall-clock to a UTC instant across DST.

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

/**
 * Every seed the schedule produces for `window`, TZ-aware and high-water
 * gated. Iterates each week's local Sunday (in `activity.timeZone`, UTC
 * fallback when null) that overlaps the window; for each schedule slot,
 * places it at its LOCAL weekday + wall-clock time-of-day, converts to a UTC
 * instant, and includes it only when it lands strictly after the activity's
 * `generatedThrough` high-water mark and within [window.from, window.to).
 */
export function generateEventSeeds(args: GenerateEventSeedsArgs): GeneratedEventSeed[] {
  const { activity, window, existingStartAtMs } = args
  if (activity.schedule.length === 0) return []

  const timeZone = activity.timeZone ?? DEFAULT_TIME_ZONE
  const highWaterMark = activity.generatedThrough ?? EPOCH
  const seeds: GeneratedEventSeed[] = []

  const ws = zonedWallClock(timeZone, window.from)
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
    if (weekSundayUtc.getTime() >= window.to.getTime()) break

    for (const slot of activity.schedule) {
      const local = addCalendarDays(weekSunday.year, weekSunday.month, weekSunday.day, slot.day)
      const hour = Math.floor(slot.startMinutes / MINUTES_PER_HOUR)
      const minute = slot.startMinutes % MINUTES_PER_HOUR
      const slotStart = wallClockToUtc(
        timeZone,
        local.year,
        local.month,
        local.day,
        hour,
        minute,
        0,
        0,
      )

      if (slotStart.getTime() <= highWaterMark.getTime()) continue
      if (slotStart.getTime() < window.from.getTime()) continue
      if (slotStart.getTime() >= window.to.getTime()) continue
      // Dedupe guard: a day that already has a pending event on this exact
      // instant is skipped so pattern-edit regeneration never duplicates it.
      if (existingStartAtMs?.has(slotStart.getTime())) continue

      seeds.push({
        title: activity.title,
        description: activity.description,
        location: activity.defaultLocation,
        locationLat: activity.locationLat,
        locationLng: activity.locationLng,
        color: activity.color,
        startAt: slotStart,
        endAt: new Date(slotStart.getTime() + slot.durationMin * MS_PER_MINUTE),
      })
    }
  }

  return seeds
}
