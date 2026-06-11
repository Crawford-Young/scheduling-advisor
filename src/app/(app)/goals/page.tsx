import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserTasks } from '@/server/queries/tasks'
import { GoalCard } from '@/components/cards/goal-card'
import { PageHeader, EmptyState } from '@/lib/ui'
import { OpenChatButton } from '@/components/chat/open-chat-button'
import { GoalAddButton } from '@/components/goals/goal-add-button'
import { ActivitySettingsMenu } from '@/components/activity/activity-settings-menu'

export default async function GoalsPage(): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const allTasks = await getUserTasks()
  const goals = allTasks.filter((t) => t.type === 'goal')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Goals" />
        <GoalAddButton />
      </div>
      {goals.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState message="No goals yet. Add one or ask the AI to help you set one." />
          <OpenChatButton label="Set a goal with AI" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {goals.map((goal) => (
            <div key={goal.id} className="space-y-1">
              <GoalCard
                taskId={goal.id}
                title={goal.title}
                status={goal.status}
                targetDate={goal.targetDate?.toISOString().slice(0, 10) ?? null}
              />
              <details className="text-xs">
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer px-1">
                  Activity settings
                </summary>
                <ActivitySettingsMenu
                  taskId={goal.id}
                  activityType={goal.activityType}
                  visibility={goal.visibility}
                  joinability={goal.joinability ?? undefined}
                  maxParticipants={goal.maxParticipants ?? undefined}
                />
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
