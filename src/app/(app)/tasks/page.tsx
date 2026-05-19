import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserTasks } from '@/server/queries/tasks'
import { PageHeader, EmptyState, Badge } from '@/lib/ui'
import { OpenChatButton } from '@/components/chat/open-chat-button'
import { TaskAddButton } from '@/components/tasks/task-add-button'
import { TaskRowActions } from '@/components/tasks/task-row-actions'

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
  const tasks = allTasks
    .filter((t) => t.type === 'task')
    .sort((a, b) => {
      if (!a.startAt) return 1
      if (!b.startAt) return -1
      return a.startAt.getTime() - b.startAt.getTime()
    })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Tasks" />
        <TaskAddButton />
      </div>
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState message="No tasks yet. Add one or ask the AI to plan your week." />
          <OpenChatButton label="Plan tasks with AI" />
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-card border-border flex items-center gap-3 rounded-lg border px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-sm font-medium">{task.title}</p>
                <p className="text-muted-foreground text-xs">{formatDateTime(task.startAt)}</p>
              </div>
              <Badge>{STATUS_LABELS[task.status]}</Badge>
              <TaskRowActions
                taskId={task.id}
                title={task.title}
                startAt={task.startAt?.toISOString() ?? null}
                endAt={task.endAt?.toISOString() ?? null}
                recurrence={task.recurrence ?? null}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
