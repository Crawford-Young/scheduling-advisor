import { zonedWallClock } from '@/lib/series-generation'

const MS_PER_DAY = 86_400_000

export interface StreakResult {
  readonly current: number
  readonly best: number
}

interface Occurrence {
  readonly startAt: Date | null
  readonly status: string
}

function utcDayIndex(d: Date): number {
  return Math.floor(d.getTime() / MS_PER_DAY)
}

// Calendar-day index (days since UTC epoch) of `d`'s LOCAL wall-clock date in
// `timeZone` — the TZ-aware counterpart to utcDayIndex, comparable the same
// way. Reuses series-generation's zonedWallClock rather than duplicating the
// Intl offset math (wave 2.6 S13).
function zonedDayIndex(timeZone: string, d: Date): number {
  const wc = zonedWallClock(timeZone, d)
  return Date.UTC(wc.year, wc.month, wc.day) / MS_PER_DAY
}

// "Past" relative to `now`, in the occurrence's own series time zone when
// present (S12's persisted tasks.time_zone), else the existing UTC day
// boundary (legacy rows / null fallback).
function isPastDay(startAt: Date, now: Date, timeZone: string | null): boolean {
  if (timeZone !== null) {
    return zonedDayIndex(timeZone, startAt) < zonedDayIndex(timeZone, now)
  }
  return utcDayIndex(startAt) < utcDayIndex(now)
}

/**
 * Consecutive-scheduled-occurrence streak over one recurrence group.
 * current: walk backward from the newest due occurrence; completed counts,
 * a pending occurrence dated today is skipped (day isn't over), anything
 * else breaks the chain. best: longest completed run over due history, no grace.
 */
export function computeGroupStreak(occurrences: readonly Occurrence[], now: Date): StreakResult {
  const due = occurrences
    .filter(
      (o): o is { startAt: Date; status: string } =>
        o.startAt !== null && o.startAt.getTime() <= now.getTime(),
    )
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())

  let best = 0
  let run = 0
  for (const o of due) {
    if (o.status === 'completed') {
      run += 1
      best = Math.max(best, run)
    } else {
      run = 0
    }
  }

  let current = 0
  const today = utcDayIndex(now)
  for (const o of [...due].reverse()) {
    if (o.status === 'completed') {
      current += 1
      continue
    }
    if (utcDayIndex(o.startAt) === today) continue
    break
  }

  return { current, best }
}

export interface IdOccurrence {
  readonly id: string
  readonly startAt: Date | null
  readonly status: string
  /** Series' persisted IANA zone (S12); null → legacy UTC day-boundary fallback. */
  readonly timeZone: string | null
}

interface DatedIdOccurrence {
  readonly id: string
  readonly startAt: Date
  readonly status: string
  readonly timeZone: string | null
}

/**
 * Completed-only per-occurrence streak over one recurrence group (wave 2.6
 * S13 — supersedes the earlier projection design). Occurrences with a null
 * startAt are excluded from the chronological walk and reported as 0.
 * Walking ascending by startAt: a completed occurrence extends the run and
 * emits it; a non-completed occurrence dated before today (in the
 * occurrence's own series time zone, UTC fallback when null) emits 0 AND
 * resets the run to 0; a non-completed occurrence dated today or later
 * emits 0 without touching the run — it hasn't happened yet, so it can't
 * show a flame, but a today/future gap does not break a live run the way a
 * past miss does.
 */
export function computePerOccurrenceStreaks(
  occurrences: readonly IdOccurrence[],
  now: Date,
): Record<string, number> {
  const result: Record<string, number> = {}
  const dated: DatedIdOccurrence[] = []
  for (const o of occurrences) {
    if (o.startAt === null) {
      result[o.id] = 0
    } else {
      dated.push({ id: o.id, startAt: o.startAt, status: o.status, timeZone: o.timeZone })
    }
  }
  dated.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())

  let run = 0
  for (const o of dated) {
    if (o.status === 'completed') {
      run += 1
      result[o.id] = run
    } else if (isPastDay(o.startAt, now, o.timeZone)) {
      result[o.id] = 0
      run = 0
    } else {
      result[o.id] = 0
    }
  }
  return result
}
