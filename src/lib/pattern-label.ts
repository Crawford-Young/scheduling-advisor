// Pure pattern-label derivation for the activities table (wave 3 activity
// model). Renders an activity's per-day schedule as a compact human label —
// e.g. "Mon/Wed/Fri · 3×/wk" — Sunday-first, one entry per weekday, with the
// total weekly session count. No time is shown (per the activities-page spec),
// so no `use24h` dependency: session times surface in the edit dialog and the
// Next-event column, not here.

import type { ActivityScheduleSlot } from '@/lib/schemas/activity'

const DAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const SEPARATOR = ' · '
const DAY_SEPARATOR = '/'
const EMPTY_LABEL = 'No schedule'

/**
 * Compact schedule label: distinct weekdays (Sunday-first) joined by `/`,
 * followed by the total weekly session count. Returns "No schedule" when the
 * activity has no scheduled slots.
 */
export function formatPatternLabel(schedule: readonly ActivityScheduleSlot[]): string {
  if (schedule.length === 0) return EMPTY_LABEL

  const distinctDays = Array.from(new Set(schedule.map((s) => s.day))).sort((a, b) => a - b)
  const days = distinctDays.map((day) => DAY_SHORT_NAMES[day]).join(DAY_SEPARATOR)
  return `${days}${SEPARATOR}${schedule.length}×/wk`
}
