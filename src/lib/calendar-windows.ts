import * as Sentry from '@sentry/nextjs'
import { dayOverridesSchema, type CalendarDayOverrides } from '@/lib/schemas/calendar-prefs'

// Defaults are minutes-since-midnight: 09:00 wake, 17:00 sleep.
export const DEFAULT_WAKE_MINUTES = 540
export const DEFAULT_SLEEP_MINUTES = 1020

const DAYS_PER_WEEK = 7

export interface DayWindow {
  readonly wake: number
  readonly sleep: number
}

interface CalendarWindowPrefs {
  readonly workingHoursStart: number
  readonly workingHoursEnd: number
  readonly dayOverrides: unknown
}

function resolveOverrides(dayOverrides: unknown): CalendarDayOverrides {
  const parsed = dayOverridesSchema.safeParse(dayOverrides ?? {})

  if (!parsed.success) {
    Sentry.captureMessage(
      'Encountered corrupt calendar dayOverrides — falling back to global hours',
    )
    return {}
  }

  return parsed.data
}

export function resolveDayWindows(prefs: CalendarWindowPrefs | null): readonly DayWindow[] {
  if (prefs === null) {
    return Array.from({ length: DAYS_PER_WEEK }, () => ({
      wake: DEFAULT_WAKE_MINUTES,
      sleep: DEFAULT_SLEEP_MINUTES,
    }))
  }

  const { workingHoursStart, workingHoursEnd, dayOverrides } = prefs
  const overrides = resolveOverrides(dayOverrides)

  return Array.from({ length: DAYS_PER_WEEK }, (_, day) => {
    const override = overrides[String(day) as keyof CalendarDayOverrides]

    return override ?? { wake: workingHoursStart, sleep: workingHoursEnd }
  })
}
