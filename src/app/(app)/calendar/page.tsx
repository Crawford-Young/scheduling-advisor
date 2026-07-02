import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserTasks } from '@/server/queries/tasks'
import { getTaskStreaks } from '@/server/queries/consistency'
import { getCalendarPrefs } from '@/server/queries/calendar-prefs'
import { safeDeleteExpiredEvents } from '@/server/actions/event-ttl'
import { CalendarClient } from '@/components/calendar/calendar-client'
import { DEFAULT_WAKE_MINUTES, DEFAULT_SLEEP_MINUTES } from '@/lib/calendar-windows'

const MINUTES_PER_HOUR = 60

function getCurrentWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

export default async function CalendarPage(): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id
  const weekStart = getCurrentWeekStart()

  const prefs = await getCalendarPrefs()
  // Prefs are minutes-since-midnight; CalendarClient still consumes whole hours.
  // Convert at this boundary until A9 makes the calendar grid minute-aware.
  const wakeMinutes = prefs?.workingHoursStart ?? DEFAULT_WAKE_MINUTES
  const sleepMinutes = prefs?.workingHoursEnd ?? DEFAULT_SLEEP_MINUTES
  const wakeHour = Math.floor(wakeMinutes / MINUTES_PER_HOUR)
  const sleepHour = Math.ceil(sleepMinutes / MINUTES_PER_HOUR)

  await safeDeleteExpiredEvents()
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
      }
    })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <CalendarClient
        weekStart={weekStart}
        events={events}
        wakeHour={wakeHour}
        sleepHour={sleepHour}
      />
    </div>
  )
}
