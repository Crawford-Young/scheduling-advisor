import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserTasks } from '@/server/queries/tasks'
import { getTaskStreaks } from '@/server/queries/consistency'
import { getCalendarPrefs } from '@/server/queries/calendar-prefs'
import { safeDeleteExpiredEvents } from '@/server/actions/event-ttl'
import { safeExtendSeries } from '@/server/actions/series-mutations'
import { CalendarClient } from '@/components/calendar/calendar-client'
import {
  DEFAULT_WAKE_MINUTES,
  DEFAULT_SLEEP_MINUTES,
  resolveDayWindows,
} from '@/lib/calendar-windows'

const MINUTES_PER_HOUR = 60

function getCurrentWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

const WEEK_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validates the `?week=` URL param. The library snaps any date to its
 * containing week's Sunday internally, so a valid date string is passed
 * through unchanged; anything missing or malformed falls back to today's
 * week.
 */
function resolveWeekStart(week: string | undefined): string {
  if (
    week !== undefined &&
    WEEK_PARAM_RE.test(week) &&
    !Number.isNaN(new Date(`${week}T00:00:00`).getTime())
  ) {
    return week
  }
  return getCurrentWeekStart()
}

interface CalendarPageProps {
  readonly searchParams: Promise<{ week?: string }>
}

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id
  const { week } = await searchParams
  const weekStart = resolveWeekStart(week)

  const prefs = await getCalendarPrefs()
  // Prefs are minutes-since-midnight; CalendarClient still consumes whole hours.
  // Convert at this boundary until A9 makes the calendar grid minute-aware.
  const wakeMinutes = prefs?.workingHoursStart ?? DEFAULT_WAKE_MINUTES
  const sleepMinutes = prefs?.workingHoursEnd ?? DEFAULT_SLEEP_MINUTES
  const wakeHour = Math.floor(wakeMinutes / MINUTES_PER_HOUR)
  const sleepHour = Math.ceil(sleepMinutes / MINUTES_PER_HOUR)

  // resolveDayWindows emits minutes-since-midnight (A2.1 persistence); the
  // library's dayWindows expect fractional HOURS (L4.1). Convert at this single
  // boundary. WeekCalendarView ignores the hour/sleep window props when
  // dayWindows is present, but passing both is the documented compatible path.
  const dayWindows = resolveDayWindows(prefs).map((w) => ({
    wake: w.wake / MINUTES_PER_HOUR,
    sleep: w.sleep / MINUTES_PER_HOUR,
  }))

  await safeDeleteExpiredEvents()
  await safeExtendSeries()
  const allTasks = await getUserTasks()

  const taskIds = allTasks.map((t) => t.id)
  const streakMap = await getTaskStreaks(userId, taskIds)

  const events = allTasks
    .filter((t) => t.targetDate !== null || t.startAt !== null)
    .map((t) => {
      const dateStr = t.startAt
        ? t.startAt.toISOString().slice(0, 10)
        : t.targetDate!.toISOString().slice(0, 10)
      const startTime = t.startAt?.toISOString() ?? `${dateStr}T09:00:00`
      const endTime = t.endAt?.toISOString() ?? `${dateStr}T10:00:00`
      return {
        id: t.id,
        title: t.title,
        start: startTime,
        end: endTime,
        type: t.type as 'task' | 'goal',
        status: t.status,
        streak: streakMap[t.id] ?? 0,
        activityType: t.activityType,
        visibility: t.visibility,
        color: t.color ?? null,
        allDay: t.allDay ?? false,
        location: t.location ?? null,
        description: t.description ?? null,
        recurrence: t.recurrence ?? null,
        // Persisted weekday set seeds the chip edit popover's Days picker.
        recurrenceDays: t.recurrenceDays ?? null,
        // Persisted lock flag seeds the chip's lock state (A2.4).
        locked: t.locked,
        // Recurrence-group id (wave 2.6 S4): non-null means the row belongs to
        // a fanned recurrence group, driving calendar-client's updateSeries
        // routing instead of the per-occurrence updateTask/rescheduleTask paths.
        recurrenceGroupId: t.recurrenceGroupId ?? null,
      }
    })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <CalendarClient
        weekStart={weekStart}
        events={events}
        wakeHour={wakeHour}
        sleepHour={sleepHour}
        dayWindows={dayWindows}
        use24h={prefs?.use24h ?? false}
      />
    </div>
  )
}
