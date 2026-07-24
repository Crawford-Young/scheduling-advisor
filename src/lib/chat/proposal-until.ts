import type { RecurrenceFrequency } from '@/lib/chat/weekdays'

/**
 * Pure local-calendar date math deriving a `createSeries` `until` bound from a
 * chat `proposeEvent` proposal's `recurrenceCount`. No server/db/auth imports
 * — client-safe so `EventProposalCard` can call it inline on approval.
 *
 * Local calendar terms only (never `toISOString`/UTC parsing) — matches the
 * local-wall-clock invariant and the card's own local anchor construction.
 */

const DAYS_PER_WEEK = 7
// `recurrenceCount` is 1-indexed (a count of 1 covers the anchor's own
// day/week/month), so every freq's step is `count - 1` in its own unit.
const COUNT_TO_STEP_OFFSET = 1

const MONTH_INDEX_OFFSET = 1
const PAD_WIDTH = 2
const PAD_CHAR = '0'

/** Local `Date` (midnight) from a `'YYYY-MM-DD'` string via local constructor parts — never `new Date(str)`, which parses UTC midnight. */
function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year!, month! - MONTH_INDEX_OFFSET, day!)
}

/** Local `'YYYY-MM-DD'` from a `Date`'s LOCAL getters — never `toISOString`. */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + MONTH_INDEX_OFFSET).padStart(PAD_WIDTH, PAD_CHAR)
  const day = String(date.getDate()).padStart(PAD_WIDTH, PAD_CHAR)
  return `${year}-${month}-${day}`
}

/** Add `n` calendar days, local calendar math (DST-safe: no hour/minute components involved). */
function addLocalDays(base: Date, n: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n)
}

/** Add `n` calendar months, clamping day-of-month overflow to the target month's last day (Jan 31 + 1 month → Feb 28/29). */
function addLocalMonthsClamped(base: Date, n: number): Date {
  const targetYear = base.getFullYear()
  const targetMonthIndex = base.getMonth() + n
  // Day 0 of the month AFTER the target = the target month's last day.
  const lastDayOfTargetMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate()
  const day = Math.min(base.getDate(), lastDayOfTargetMonth)
  return new Date(targetYear, targetMonthIndex, day)
}

/**
 * The `createSeries` `until` date (inclusive, local `'YYYY-MM-DD'`) for a
 * `proposeEvent` recurrence anchored on `anchorDate`. `count`'s unit is
 * per-freq, matching `proposeEvent`'s `recurrenceCount` semantics: daily =
 * days, weekly = WEEKS the pattern repeats (not occurrences), monthly =
 * months.
 */
export function computeUntilFromCount(
  anchorDate: string,
  freq: RecurrenceFrequency,
  count: number,
): string {
  const anchor = parseLocalDate(anchorDate)
  const step = count - COUNT_TO_STEP_OFFSET

  if (freq === 'daily') return formatLocalDate(addLocalDays(anchor, step))
  if (freq === 'weekly')
    return formatLocalDate(addLocalDays(anchor, count * DAYS_PER_WEEK - COUNT_TO_STEP_OFFSET))
  return formatLocalDate(addLocalMonthsClamped(anchor, step))
}
