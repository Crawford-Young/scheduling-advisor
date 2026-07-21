import { auth } from '@/auth'
import { getUserActivities } from '@/server/queries/activities'
import { getUserEvents } from '@/server/queries/events'
import { getTokenBalance } from '@/server/queries/tokens'
import { computeWeeklyFit, localWeekBounds } from '@/lib/weekly-fit'
import type { ActivityScheduleSlot } from '@/lib/schemas/activity'

// Sunday-first, matching Date#getDay() and the activity schedule's `day` index.
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MINUTES_PER_HOUR = 60

function padTwo(value: number): string {
  return value.toString().padStart(2, '0')
}

function minutesToHhmm(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const mins = minutes % MINUTES_PER_HOUR
  return `${padTwo(hours)}:${padTwo(mins)}`
}

function scheduleSummary(schedule: readonly ActivityScheduleSlot[]): string {
  if (schedule.length === 0) return 'no fixed slots'
  return schedule
    .map(
      (slot) =>
        `${WEEKDAY_NAMES[slot.day]} ${minutesToHhmm(slot.startMinutes)} (${slot.durationMin}m)`,
    )
    .join(', ')
}

/**
 * Volatile chat context block (dates + this-week user data). It travels OUTSIDE
 * the cached system prefix, so its churn never invalidates the prompt cache;
 * mode `buildSystem()` output stays byte-stable independently of this.
 */
export async function buildContextBlock(timezone: string, now: Date = new Date()): Promise<string> {
  const session = await auth()
  const userId = session?.user?.id ?? ''

  const [activities, events, balance] = await Promise.all([
    getUserActivities(),
    getUserEvents(),
    getTokenBalance(userId),
  ])

  const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
  const todayStr = dateFormatter.format(now)

  // Week header in the user's timezone (display only).
  const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const day = nowInTz.getDay()
  const mondayInTz = new Date(nowInTz)
  mondayInTz.setDate(nowInTz.getDate() - ((day + 6) % 7))
  const sundayInTz = new Date(mondayInTz)
  sundayInTz.setDate(mondayInTz.getDate() + 6)
  const weekRange = `${dateFormatter.format(mondayInTz)} – ${dateFormatter.format(sundayInTz)}`

  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  // this-week fit + event window both derive from the same local-wall-clock
  // bounds the /activities page uses (computeWeeklyFit), so the numbers Cy sees
  // match what the user sees on screen.
  const { start: weekStart, end: weekEnd } = localWeekBounds(now)

  const activityLines = activities
    .map((activity) => {
      const fit = computeWeeklyFit(activity, events, now)
      return `  [${activity.id}] ${activity.title} — ${activity.minDurationMin}-${activity.maxDurationMin}m · target ${activity.weeklyTargetSessions}/wk · this week ${fit.completed}/${fit.target} · ${scheduleSummary(activity.schedule)}`
    })
    .join('\n')

  const eventLines = events
    .filter(
      (event) =>
        event.startAt !== null &&
        event.startAt.getTime() >= weekStart.getTime() &&
        event.startAt.getTime() < weekEnd.getTime(),
    )
    .sort((a, b) => a.startAt!.getTime() - b.startAt!.getTime())
    .map((event) => {
      const dateStr = dateFormatter.format(event.startAt!)
      const timeStr = event.allDay ? 'all day' : timeFormatter.format(event.startAt!)
      const status = event.status === 'completed' ? 'done' : 'pending'
      return `  [${event.id}] ${event.title} · ${dateStr} ${timeStr} — ${status}`
    })
    .join('\n')

  return `--- Current Context ---
Date: ${todayStr}
Week: ${weekRange}
Timezone: ${timezone}
Credits remaining: ${balance}

Activities (weekly templates):
${activityLines || '  (none)'}

This week's events:
${eventLines || '  (none)'}
--- End Context ---`
}
