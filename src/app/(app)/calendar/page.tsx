import * as React from 'react'
import { ViewTransition } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserEvents } from '@/server/queries/events'
import { getUserActivities } from '@/server/queries/activities'
import { getCalendarPrefs } from '@/server/queries/calendar-prefs'
import { getTravelWarnings } from '@/server/queries/travel-warnings'
import { safeDeleteExpiredEvents } from '@/server/actions/event-ttl'
import { safeGenerateEvents } from '@/server/actions/event-generation'
import { CalendarClient } from '@/components/calendar/calendar-client'
import {
  DEFAULT_WAKE_MINUTES,
  DEFAULT_SLEEP_MINUTES,
  resolveDayWindows,
} from '@/lib/calendar-windows'
import { resolveWeekStart } from '@/lib/calendar-week-param'

const MINUTES_PER_HOUR = 60

interface CalendarPageProps {
  readonly searchParams: Promise<{ week?: string }>
}

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { week } = await searchParams
  const weekStart = resolveWeekStart(week)

  const prefs = await getCalendarPrefs()
  // Prefs are minutes-since-midnight; CalendarClient still consumes whole hours.
  // Convert at this boundary until the calendar grid becomes minute-aware.
  const wakeMinutes = prefs?.workingHoursStart ?? DEFAULT_WAKE_MINUTES
  const sleepMinutes = prefs?.workingHoursEnd ?? DEFAULT_SLEEP_MINUTES
  const wakeHour = Math.floor(wakeMinutes / MINUTES_PER_HOUR)
  const sleepHour = Math.ceil(sleepMinutes / MINUTES_PER_HOUR)

  // resolveDayWindows emits minutes-since-midnight; the library's dayWindows
  // expect fractional HOURS. Convert at this single boundary.
  const dayWindows = resolveDayWindows(prefs).map((w) => ({
    wake: w.wake / MINUTES_PER_HOUR,
    sleep: w.sleep / MINUTES_PER_HOUR,
  }))

  // TTL sweep, then the sliding-window generation sweep (both read-path safe),
  // BEFORE reading events so the fresh window is visible on this render.
  await safeDeleteExpiredEvents()
  await safeGenerateEvents()

  const dbEvents = await getUserEvents()
  const activities = await getUserActivities()
  const travelWarnings = await getTravelWarnings(session.user.id)

  // Only timed events render on the grid; a null startAt/endAt is unschedulable.
  const events = dbEvents
    .filter((e) => e.startAt !== null && e.endAt !== null)
    .map((e) => ({
      id: e.id,
      title: e.title,
      start: e.startAt!.toISOString(),
      end: e.endAt!.toISOString(),
      color: e.color ?? null,
      allDay: e.allDay,
      location: e.location ?? null,
      description: e.description ?? null,
      status: e.status,
      locked: e.locked,
      activityId: e.activityId ?? null,
    }))

  // Full activity templates threaded to CalendarClient: they feed both the
  // drag-create popover's picker AND the in-calendar "Edit activity" flow
  // (which seeds ActivityTemplateDialog / updateActivity).
  const activityOptions = activities.map((a) => ({
    id: a.id,
    title: a.title,
    color: a.color ?? null,
    description: a.description,
    defaultLocation: a.defaultLocation,
    minDurationMin: a.minDurationMin,
    maxDurationMin: a.maxDurationMin,
    weeklyTargetSessions: a.weeklyTargetSessions,
    schedule: a.schedule,
    timeZone: a.timeZone,
  }))

  return (
    <ViewTransition enter="reveal-enter" default="none">
      <div className="mx-auto max-w-5xl space-y-6">
        <CalendarClient
          weekStart={weekStart}
          events={events}
          activities={activityOptions}
          wakeHour={wakeHour}
          sleepHour={sleepHour}
          dayWindows={dayWindows}
          use24h={prefs?.use24h ?? false}
          travelWarnings={travelWarnings}
        />
      </div>
    </ViewTransition>
  )
}
