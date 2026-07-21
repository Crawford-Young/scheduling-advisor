import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getUserActivities, type ActivityRowDb } from '@/server/queries/activities'
import {
  getUserEvents,
  getStandaloneUpcomingEvents,
  type EventRowDb,
} from '@/server/queries/events'
import { getCalendarPrefs } from '@/server/queries/calendar-prefs'
import { safeDeleteExpiredEvents } from '@/server/actions/event-ttl'
import { safeGenerateEvents } from '@/server/actions/event-generation'
import { EmptyState } from '@/lib/ui'
import { OpenChatButton } from '@/components/chat/open-chat-button'
import { ActivityFilters } from '@/components/activity/activity-filters'
import { ActivityCreateButton } from '@/components/activity/activity-create-button'
import {
  ActivityTable,
  OneOffEventsTable,
  type ActivityRow,
  type OneOffEventRow,
} from '@/components/activity/activity-table'
import { computeWeeklyFit } from '@/lib/weekly-fit'

const editParamSchema = z.string().uuid()

/** Earliest future event start (ISO) linked to `activityId`, or null when none. */
function nextEventIsoFor(
  activityId: string,
  events: readonly EventRowDb[],
  now: Date,
): string | null {
  const futureStarts = events
    .filter(
      (e) =>
        e.activityId === activityId && e.startAt !== null && e.startAt.getTime() > now.getTime(),
    )
    .map((e) => e.startAt!.getTime())
  if (futureStarts.length === 0) return null
  return new Date(Math.min(...futureStarts)).toISOString()
}

function toActivityRow(
  activity: ActivityRowDb,
  events: readonly EventRowDb[],
  now: Date,
): ActivityRow {
  const fit = computeWeeklyFit(activity, events, now)
  return {
    id: activity.id,
    title: activity.title,
    color: activity.color,
    description: activity.description,
    defaultLocation: activity.defaultLocation,
    minDurationMin: activity.minDurationMin,
    maxDurationMin: activity.maxDurationMin,
    weeklyTargetSessions: activity.weeklyTargetSessions,
    // DB `day` is a plain number but zod-validated 0-6 at write time; the dialog
    // contract narrows it to the 0-6 literal union.
    schedule: activity.schedule as ActivityRow['schedule'],
    timeZone: activity.timeZone,
    completedThisWeek: fit.completed,
    nextEventIso: nextEventIsoFor(activity.id, events, now),
  }
}

function toOneOffRow(event: EventRowDb): OneOffEventRow {
  return {
    id: event.id,
    title: event.title,
    startAt: event.startAt?.toISOString() ?? null,
    endAt: event.endAt?.toISOString() ?? null,
    allDay: event.allDay,
    color: event.color,
    location: event.location,
    description: event.description,
    status: event.status,
  }
}

interface ActivitiesPageProps {
  readonly searchParams: Promise<{ q?: string; edit?: string }>
}

export default async function ActivitiesPage({
  searchParams,
}: ActivitiesPageProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { q, edit } = await searchParams

  // Read-path-safe sweeps: TTL cleanup first, then slide the generation window.
  await safeDeleteExpiredEvents()
  await safeGenerateEvents()

  const prefs = await getCalendarPrefs()
  const use24h = prefs?.use24h ?? false

  const [activities, events, standaloneEvents] = await Promise.all([
    getUserActivities(),
    getUserEvents(),
    getStandaloneUpcomingEvents(),
  ])

  const now = new Date()
  const query = q?.toLowerCase()
  const activityRows = activities
    .filter((a) => !query || a.title.toLowerCase().includes(query))
    .map((a) => toActivityRow(a, events, now))

  // Validate the ?edit deep link: a well-formed uuid the user actually owns
  // (ownership via the already-scoped getUserActivities result). Anything else
  // is ignored — no crash.
  const parsedEdit = edit ? editParamSchema.safeParse(edit) : null
  const initialEditId =
    parsedEdit?.success && activities.some((a) => a.id === parsedEdit.data) ? parsedEdit.data : null

  const oneOffRows = standaloneEvents.map(toOneOffRow)

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1">
            <ActivityFilters />
          </div>
          <ActivityCreateButton use24h={use24h} />
        </div>

        {activityRows.length === 0 ? (
          <div className="flex flex-col items-center gap-4">
            <EmptyState message="No activities yet. Add one or ask the AI to plan your week." />
            <OpenChatButton label="Plan with AI" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <ActivityTable items={activityRows} use24h={use24h} initialEditId={initialEditId} />
          </div>
        )}
      </div>

      {oneOffRows.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">One-off events</h2>
          <div className="overflow-x-auto">
            <OneOffEventsTable items={oneOffRows} use24h={use24h} />
          </div>
        </section>
      )}
    </div>
  )
}
