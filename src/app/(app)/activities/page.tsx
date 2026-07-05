import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserTasks } from '@/server/queries/tasks'
import { getTaskStreaks } from '@/server/queries/consistency'
import { getCalendarPrefs } from '@/server/queries/calendar-prefs'
import { safeDeleteExpiredEvents } from '@/server/actions/event-ttl'
import { EmptyState } from '@/lib/ui'
import { OpenChatButton } from '@/components/chat/open-chat-button'
import { ActivityFilters } from '@/components/activity/activity-filters'
import { ActivityCreateButton } from '@/components/activity/activity-create-button'
import { ActivityTable, type ActivityRow } from '@/components/activity/activity-table'

type ActivityType = 'task' | 'goal'
type ActivityFilter = ActivityType | 'all'

const FILTER_TYPES: readonly ActivityType[] = ['task', 'goal']
const RECURRING_PARAM_TRUE = '1'

type UserTask = Awaited<ReturnType<typeof getUserTasks>>[number]

function resolveFilter(type: string | undefined): ActivityFilter {
  return FILTER_TYPES.includes(type as ActivityType) ? (type as ActivityType) : 'all'
}

function formatDateTime(date: Date | null): string {
  if (!date) return 'No time set'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function toDateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

interface DateFields {
  readonly dateIso: string | null
  readonly dateLabel: string
}

/** Type-specific date sort key + display label: goals sort by date-only target, tasks by start instant. */
function buildDateFields(task: UserTask): DateFields {
  if (task.type === 'goal') {
    const target = toDateOnly(task.targetDate)
    return { dateIso: target, dateLabel: target ? `Target: ${target}` : 'No target date' }
  }
  return { dateIso: task.startAt?.toISOString() ?? null, dateLabel: formatDateTime(task.startAt) }
}

function toActivityRow(task: UserTask, streak: number): ActivityRow {
  const { dateIso, dateLabel } = buildDateFields(task)
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    status: task.status,
    dateIso,
    dateLabel,
    recurrence: task.recurrence ?? null,
    location: task.location,
    description: task.description,
    color: task.color,
    allDay: task.allDay,
    streak,
    startAt: task.startAt?.toISOString() ?? null,
    endAt: task.endAt?.toISOString() ?? null,
    targetDate: toDateOnly(task.targetDate),
    activityType: task.activityType,
    visibility: task.visibility,
    joinability: task.joinability ?? null,
    maxParticipants: task.maxParticipants ?? null,
  }
}

interface ActivitiesPageProps {
  readonly searchParams: Promise<{ type?: string; status?: string; q?: string; recurring?: string }>
}

export default async function ActivitiesPage({
  searchParams,
}: ActivitiesPageProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { type, status, q, recurring } = await searchParams
  const filter = resolveFilter(type)

  await safeDeleteExpiredEvents()
  const prefs = await getCalendarPrefs()
  const use24h = prefs?.use24h ?? false
  const allTasks = await getUserTasks()
  const items = allTasks
    .filter((t) => filter === 'all' || t.type === filter)
    .filter((t) => !status || t.status === status)
    .filter((t) => (recurring === RECURRING_PARAM_TRUE ? t.recurrence !== null : true))
    .filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase()))

  const streakMap = await getTaskStreaks(
    session.user.id,
    items.map((t) => t.id),
  )

  const rows = items.map((task) =>
    toActivityRow(task, task.type === 'goal' ? 0 : (streakMap[task.id] ?? 0)),
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <ActivityFilters />
        </div>
        <ActivityCreateButton use24h={use24h} />
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState message="No activities yet. Add one or ask the AI to plan your week." />
          <OpenChatButton label="Plan with AI" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <ActivityTable items={rows} use24h={use24h} />
        </div>
      )}
    </div>
  )
}
