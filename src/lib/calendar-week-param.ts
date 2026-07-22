const WEEK_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/

function getCurrentWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

/**
 * Validates the `?week=` URL param, shared by the calendar and profile week
 * views. The library snaps any date to its containing week's Sunday
 * internally, so a valid date string is passed through unchanged; anything
 * missing or malformed falls back to today's week.
 */
export function resolveWeekStart(week: string | undefined): string {
  if (
    week !== undefined &&
    WEEK_PARAM_RE.test(week) &&
    !Number.isNaN(new Date(`${week}T00:00:00`).getTime())
  ) {
    return week
  }
  return getCurrentWeekStart()
}

const DATE_PAD_WIDTH = 2

/**
 * Formats a Date as the local-wall-clock YYYY-MM-DD string the calendar's
 * `?week=` param accepts (resolveWeekStart snaps any in-week date to Sunday).
 * Local getters per the local-wall-clock invariant — never ISO substrings.
 */
export function weekParamFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(DATE_PAD_WIDTH, '0')
  const day = String(date.getDate()).padStart(DATE_PAD_WIDTH, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
