import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserTasks } from '@/server/queries/tasks'
import { getTaskStreaks } from '@/server/queries/consistency'
import { PageHeader, EmptyState, Badge } from '@/lib/ui'
import { OpenChatButton } from '@/components/chat/open-chat-button'
import { TaskAddButton } from '@/components/tasks/task-add-button'
import { TaskRowActions } from '@/components/tasks/task-row-actions'
import { StreakBadge } from '@/components/activity/streak-badge'
import { ActivitySettingsMenu } from '@/components/activity/activity-settings-menu'

function formatDateTime(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
}

export default async function TasksPage(): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const allTasks = await getUserTasks()
  const items = allTasks
    .filter((t) => t.type === 'task')
    .sort((a, b) => {
      if (!a.startAt) return 1
      if (!b.startAt) return -1
      return a.startAt.getTime() - b.startAt.getTime()
    })
  const streakMap = await getTaskStreaks(
    session.user.id,
    items.map((t) => t.id),
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Tasks" />
        <TaskAddButton />
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState message="No tasks yet. Add one or ask the AI to plan your week." />
          <OpenChatButton label="Plan tasks with AI" />
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((task) => (
            <div key={task.id} className="space-y-1">
              <div className="border-border bg-card flex items-center gap-3 rounded-lg border px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-medium">{task.title}</p>
                  <p className="text-muted-foreground text-xs">{formatDateTime(task.startAt)}</p>
                </div>
                <StreakBadge streak={streakMap[task.id] ?? 0} />
                <Badge>{STATUS_LABELS[task.status]}</Badge>
                <TaskRowActions
                  taskId={task.id}
                  title={task.title}
                  startAt={task.startAt?.toISOString() ?? null}
                  endAt={task.endAt?.toISOString() ?? null}
                  recurrence={task.recurrence ?? null}
                />
              </div>
              <details className="text-xs">
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer px-1">
                  Activity settings
                </summary>
                <ActivitySettingsMenu
                  taskId={task.id}
                  activityType={task.activityType}
                  visibility={task.visibility}
                  joinability={task.joinability ?? undefined}
                  maxParticipants={task.maxParticipants ?? undefined}
                />
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
