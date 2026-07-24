// Pure series-label derivation for the activities page (event-series wave).
// Renders a series RULE as a compact human label — e.g. "Mon/Wed/Fri · 9:00 AM
// · 30m", "3rd Thu monthly · 18:00 · 60m" — Sunday-first weekdays, local
// wall-clock time. Replaces the retired activity-`schedule`-based
// `formatPatternLabel` (activity `schedule` dies with the event-series wave).

const DAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

const SEPARATOR = ' · '
const DAY_SEPARATOR = '/'
const WEEKDAY_RANGE_DASH = '–'
/** A contiguous weekday run collapses into a "Start–End" range only at this length or above. */
const WEEKDAY_RANGE_MIN_LENGTH = 3

const MINUTES_PER_HOUR = 60
const HOURS_PER_HALF_DAY = 12
const NOON_HOUR = 12

/** Nth-weekday ordinal marker for "last occurrence of the month" (schema encoding). */
const LAST_NTH_ORDINAL = -1
/** Convert a 0-based `Date#getMonth()`-style index to a 1-based calendar month. */
const MONTH_OFFSET = 1

/** English ordinal-suffix teen exception range (11th-13th, never "st"/"nd"/"rd"). */
const ORDINAL_TEEN_LOW = 11
const ORDINAL_TEEN_HIGH = 13

export interface SeriesLabelInput {
  readonly freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  readonly weekdays: readonly number[] | null
  readonly dayOfMonth: number | null
  readonly nthOrdinal: number | null
  readonly nthWeekday: number | null
  readonly month: number | null
  readonly startMinutes: number
  readonly durationMin: number
  readonly until: Date | null
}

/** English ordinal suffix ("st"/"nd"/"rd"/"th") for a positive integer. */
function ordinalSuffix(n: number): string {
  const mod100 = n % 100
  if (mod100 >= ORDINAL_TEEN_LOW && mod100 <= ORDINAL_TEEN_HIGH) return 'th'
  switch (n % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

/** "1st"/"2nd".../"4th", or "Last" for the schema's -1 last-occurrence marker. */
function ordinalLabel(n: number): string {
  if (n === LAST_NTH_ORDINAL) return 'Last'
  return `${n}${ordinalSuffix(n)}`
}

/** Local wall-clock time, e.g. "9:00 AM" (12h) or "18:00"/"7:00" (24h, unpadded hour). */
function formatTime(startMinutes: number, use24h: boolean): string {
  const hour24 = Math.floor(startMinutes / MINUTES_PER_HOUR)
  const minute = startMinutes % MINUTES_PER_HOUR
  const mm = String(minute).padStart(2, '0')
  if (use24h) return `${hour24}:${mm}`
  const period = hour24 < NOON_HOUR ? 'AM' : 'PM'
  const hour12Raw = hour24 % HOURS_PER_HALF_DAY
  const hour12 = hour12Raw === 0 ? HOURS_PER_HALF_DAY : hour12Raw
  return `${hour12}:${mm} ${period}`
}

/**
 * Collapses a weekday set (Sunday-first) into short-name groups: a contiguous
 * ascending run of `WEEKDAY_RANGE_MIN_LENGTH`+ days becomes "Start–End"
 * (e.g. "Mon–Fri"); shorter runs and standalone days list individually,
 * joined by "/" (e.g. "Mon/Wed/Fri"). No circular (Sat-wraps-to-Sun) ranges.
 */
function collapseWeekdays(weekdays: readonly number[]): string {
  const sorted = [...weekdays].sort((a, b) => a - b)
  const groups: number[][] = []
  for (const day of sorted) {
    const current = groups.at(-1)
    if (current && day === current.at(-1)! + 1) {
      current.push(day)
    } else {
      groups.push([day])
    }
  }
  return groups
    .map((group) =>
      group.length >= WEEKDAY_RANGE_MIN_LENGTH
        ? `${DAY_SHORT_NAMES[group[0]!]}${WEEKDAY_RANGE_DASH}${DAY_SHORT_NAMES[group.at(-1)!]!}`
        : group.map((day) => DAY_SHORT_NAMES[day]).join(DAY_SEPARATOR),
    )
    .join(DAY_SEPARATOR)
}

/** Local `M/D/YYYY` string from a `Date`'s local getters (never `toISOString`). */
function formatLocalDate(date: Date): string {
  return `${date.getMonth() + MONTH_OFFSET}/${date.getDate()}/${date.getFullYear()}`
}

/**
 * Compact series-rule label, e.g.:
 * 'Mon/Wed/Fri · 9:00 AM · 30m' | 'Daily · 7:00' | '3rd Thu monthly · 18:00 · 60m'
 * | 'Last Sun monthly · …' | 'Every year on Mar 5 · …' ; append ' · ends <local M/D/YYYY>' when until set
 */
export function formatSeriesLabel(series: SeriesLabelInput, use24h: boolean): string {
  const time = formatTime(series.startMinutes, use24h)
  const duration = series.durationMin

  let base: string
  switch (series.freq) {
    case 'daily': {
      base = `Daily${SEPARATOR}${time}`
      break
    }
    case 'weekly': {
      const days = collapseWeekdays(series.weekdays ?? [])
      base = `${days}${SEPARATOR}${time}${SEPARATOR}${duration}m`
      break
    }
    case 'monthly': {
      base =
        series.nthOrdinal !== null && series.nthWeekday !== null
          ? `${ordinalLabel(series.nthOrdinal)} ${DAY_SHORT_NAMES[series.nthWeekday]} monthly${SEPARATOR}${time}${SEPARATOR}${duration}m`
          : `Monthly on the ${ordinalLabel(series.dayOfMonth ?? 1)}${SEPARATOR}${time}${SEPARATOR}${duration}m`
      break
    }
    case 'yearly': {
      const monthName = MONTH_SHORT_NAMES[(series.month ?? 1) - MONTH_OFFSET]
      base = `Every year on ${monthName} ${series.dayOfMonth ?? 1}${SEPARATOR}${time}${SEPARATOR}${duration}m`
      break
    }
  }

  return series.until ? `${base}${SEPARATOR}ends ${formatLocalDate(series.until)}` : base
}
