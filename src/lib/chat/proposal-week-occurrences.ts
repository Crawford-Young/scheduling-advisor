import { WEEKDAY_ORDER, type DayOfWeek, type RecurrenceFrequency } from '@/lib/chat/weekdays'
import { computeUntilFromCount } from '@/lib/chat/proposal-until'

/**
 * Pure client-side occurrence expansion for the chat `proposeEvent` week
 * preview strip. No server/db/auth imports — local-calendar math only,
 * mirroring `proposal-until.ts`'s `parseLocalDate`/`formatLocalDate`/
 * `addLocalDays` discipline (never `new Date(str)`, which parses UTC
 * midnight; never `toISOString` for date components — the local-wall-clock
 * invariant).
 */

const MONTH_INDEX_OFFSET = 1
const PAD_WIDTH = 2
const PAD_CHAR = '0'
const DAYS_TO_WEEK_END = 6

export interface WeekOccurrence {
  readonly date: string // local 'YYYY-MM-DD'
  readonly isAnchor: boolean
}

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

/** The Sunday–Saturday local week (both local-midnight `Date`s) containing `anchor`. */
function weekBounds(anchor: Date): { readonly start: Date; readonly end: Date } {
  const start = addLocalDays(anchor, -anchor.getDay())
  return { start, end: addLocalDays(start, DAYS_TO_WEEK_END) }
}

/** The earlier of two local `Date`s. */
function earlierOf(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b
}

/**
 * `weekly`'s weekday-token derivation, shared verbatim between
 * `expandOccurrencesInWeek` below and `EventProposalCard`'s
 * `buildSeriesRuleFields` — the binding parity invariant (spec §A.2): a
 * weekly recurrence with no explicit `recurrenceDays` falls back to the
 * anchor's own weekday, and both the preview and the `createSeries` confirm
 * path must derive that fallback from this ONE function, or the preview can
 * show a different occurrence set than the series it confirms.
 */
export function weekdayTokensForWeekly(
  recurrenceDays: readonly DayOfWeek[] | undefined,
  anchorStart: Date,
): readonly DayOfWeek[] {
  if (recurrenceDays && recurrenceDays.length > 0) return recurrenceDays
  return [WEEKDAY_ORDER[anchorStart.getDay()]!]
}

/**
 * Expands a `proposeEvent` proposal's occurrences that fall within the local
 * Sunday–Saturday week containing `anchorDate`, bounded by
 * `min(weekEnd, until)` where `until` derives from `recurrenceCount` via
 * `computeUntilFromCount` when present, and is otherwise unbounded (the week
 * itself is the only bound). Never returns a date before the anchor —
 * `proposeEvent`'s `date` is the first occurrence.
 */
export function expandOccurrencesInWeek(
  anchorDate: string,
  recurrence: RecurrenceFrequency | undefined,
  recurrenceDays: readonly DayOfWeek[] | undefined,
  recurrenceCount: number | undefined,
): readonly WeekOccurrence[] {
  if (recurrence === undefined || recurrence === 'monthly') {
    return [{ date: anchorDate, isAnchor: true }]
  }

  const anchor = parseLocalDate(anchorDate)
  const { start: weekStart, end: weekEnd } = weekBounds(anchor)
  const bound =
    recurrenceCount !== undefined
      ? earlierOf(
          weekEnd,
          parseLocalDate(computeUntilFromCount(anchorDate, recurrence, recurrenceCount)),
        )
      : weekEnd

  if (recurrence === 'daily') {
    const occurrences: WeekOccurrence[] = []
    for (let day = anchor; day.getTime() <= bound.getTime(); day = addLocalDays(day, 1)) {
      occurrences.push({ date: formatLocalDate(day), isAnchor: day.getTime() === anchor.getTime() })
    }
    return occurrences
  }

  return weekdayTokensForWeekly(recurrenceDays, anchor)
    .map((token) => addLocalDays(weekStart, WEEKDAY_ORDER.indexOf(token)))
    .filter((day) => day.getTime() >= anchor.getTime() && day.getTime() <= bound.getTime())
    .sort((a, b) => a.getTime() - b.getTime())
    .map((day) => ({ date: formatLocalDate(day), isAnchor: day.getTime() === anchor.getTime() }))
}
