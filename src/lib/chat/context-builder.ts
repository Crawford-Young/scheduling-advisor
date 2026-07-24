import { auth } from '@/auth'
import { getUserActivities } from '@/server/queries/activities'
import { getUserEvents } from '@/server/queries/events'
import { getTokenBalance } from '@/server/queries/tokens'
import { getSeriesForUser, type SeriesRowDb } from '@/server/queries/series'
import { computeWeeklyFit, localWeekBounds } from '@/lib/weekly-fit'
import { formatSeriesLabel } from '@/lib/pattern-label'

// `formatSeriesLabel`'s time rendering — the context block is a fixed
// convention (not user-preference-threaded), 24h keeps it compact/unambiguous
// for the model.
const SERIES_LABEL_USE_24H = true
// The standalone-series block (event_series rows with no linked activity) has
// no natural time-window bound the way `eventLines` bounds itself to the
// current week — cap the line count directly so an unbounded rule count can
// never blow up the context block.
const MAX_STANDALONE_SERIES_LINES = 20

/** Comma-joined series-rule labels for one activity's linked series, or a "no fixed slots" fallback. */
function activitySeriesSummary(activityId: string, seriesList: readonly SeriesRowDb[]): string {
  const linked = seriesList.filter((series) => series.activityId === activityId)
  if (linked.length === 0) return 'no fixed slots'
  return linked.map((series) => formatSeriesLabel(series, SERIES_LABEL_USE_24H)).join(', ')
}

/** `[id] Title — <series label>` lines for standalone (activityId: null) series, capped for token budget. */
function standaloneSeriesLines(seriesList: readonly SeriesRowDb[]): string {
  const standalone = seriesList.filter((series) => series.activityId === null)
  return standalone
    .slice(0, MAX_STANDALONE_SERIES_LINES)
    .map(
      (series) =>
        `  [${series.id}] ${series.title} — ${formatSeriesLabel(series, SERIES_LABEL_USE_24H)}`,
    )
    .join('\n')
}

/**
 * Volatile chat context block (dates + this-week user data). It travels OUTSIDE
 * the cached system prefix, so its churn never invalidates the prompt cache;
 * mode `buildSystem()` output stays byte-stable independently of this.
 */
export async function buildContextBlock(timezone: string, now: Date = new Date()): Promise<string> {
  const session = await auth()
  const userId = session?.user?.id ?? ''

  const [activities, events, balance, seriesList] = await Promise.all([
    getUserActivities(),
    getUserEvents(),
    getTokenBalance(userId),
    getSeriesForUser(userId),
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
      return `  [${activity.id}] ${activity.title} — ${activity.minDurationMin}-${activity.maxDurationMin}m · target ${activity.weeklyTargetSessions}/wk · this week ${fit.completed}/${fit.target} · ${activitySeriesSummary(activity.id, seriesList)}`
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

  const seriesLines = standaloneSeriesLines(seriesList)

  return `--- Current Context ---
Date: ${todayStr}
Week: ${weekRange}
Timezone: ${timezone}
Credits remaining: ${balance}

Activities (weekly templates):
${activityLines || '  (none)'}

This week's events:
${eventLines || '  (none)'}

Repeating series (standalone, not linked to an activity):
${seriesLines || '  (none)'}
--- End Context ---`
}
