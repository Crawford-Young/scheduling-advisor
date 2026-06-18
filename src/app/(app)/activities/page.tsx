import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserTasks } from '@/server/queries/tasks'
import { getTaskStreaks } from '@/server/queries/consistency'
import { ActivityCard, EmptyState, PageHeader } from '@/lib/ui'
import { OpenChatButton } from '@/components/chat/open-chat-button'
import { ActivityCreate } from '@/components/activity/activity-create'
import { ActivityCardActions } from '@/components/activity/activity-card-actions'

type ActivityType = 'task' | 'goal' | 'habit'
type ActivityFilter = ActivityType | 'all'

const FILTER_TYPES: readonly ActivityType[] = ['task', 'goal', 'habit']

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

/** Type-specific secondary line under the card title. */
function ActivityDetail({ task }: { task: UserTask }): React.JSX.Element {
  if (task.type === 'goal') {
    const target = toDateOnly(task.targetDate)
    return (
      <span className="text-muted-foreground text-xs">
        {target ? `Target: ${target}` : 'No target date'}
      </span>
    )
  }
  if (task.type === 'habit') {
    return (
      <span className="text-muted-foreground text-xs capitalize">{task.recurrence ?? 'daily'}</span>
    )
  }
  return <span className="text-muted-foreground text-xs">Due {formatDateTime(task.startAt)}</span>
}

interface ActivitiesPageProps {
  readonly searchParams: Promise<{ type?: string }>
}

export default async function ActivitiesPage({
  searchParams,
}: ActivitiesPageProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { type } = await searchParams
  const filter = resolveFilter(type)

  const allTasks = await getUserTasks()
  const items = filter === 'all' ? allTasks : allTasks.filter((t) => t.type === filter)
  const streakMap = await getTaskStreaks(
    session.user.id,
    items.map((t) => t.id),
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Activities" />
      <ActivityCreate />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState message="No activities yet. Add one or ask the AI to plan your week." />
          <OpenChatButton label="Plan with AI" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((task) => (
            <ActivityCard
              key={task.id}
              title={task.title}
              type={task.type}
              status={task.status}
              streak={task.type === 'goal' ? undefined : (streakMap[task.id] ?? 0)}
              visibility={task.visibility}
              detail={<ActivityDetail task={task} />}
              actions={
                <ActivityCardActions
                  taskId={task.id}
                  type={task.type}
                  title={task.title}
                  status={task.status}
                  startAt={task.startAt?.toISOString() ?? null}
                  endAt={task.endAt?.toISOString() ?? null}
                  recurrence={task.recurrence ?? null}
                  targetDate={toDateOnly(task.targetDate)}
                  social={{
                    activityType: task.activityType,
                    visibility: task.visibility,
                    joinability: task.joinability ?? undefined,
                    maxParticipants: task.maxParticipants ?? undefined,
                  }}
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
