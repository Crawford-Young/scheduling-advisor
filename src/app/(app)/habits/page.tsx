import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserTasks } from '@/server/queries/tasks'
import { getTaskStreaks } from '@/server/queries/consistency'
import { HabitCard } from '@/components/cards/habit-card'
import { PageHeader, EmptyState } from '@/lib/ui'
import { OpenChatButton } from '@/components/chat/open-chat-button'
import { HabitAddButton } from '@/components/habits/habit-add-button'
import { ActivitySettingsMenu } from '@/components/activity/activity-settings-menu'

export default async function HabitsPage(): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const allTasks = await getUserTasks()
  const habits = allTasks.filter((t) => t.type === 'habit')
  const streakMap = await getTaskStreaks(
    session.user.id,
    habits.map((h) => h.id),
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Habits" />
        <HabitAddButton />
      </div>
      {habits.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState message="No habits yet. Add one or ask the AI to help you build one." />
          <OpenChatButton label="Build a habit with AI" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {habits.map((habit) => (
            <div key={habit.id} className="space-y-1">
              <HabitCard
                taskId={habit.id}
                title={habit.title}
                status={habit.status}
                streak={streakMap[habit.id] ?? 0}
              />
              <details className="text-xs">
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer px-1">
                  Activity settings
                </summary>
                <ActivitySettingsMenu
                  taskId={habit.id}
                  activityType={habit.activityType}
                  visibility={habit.visibility}
                  joinability={habit.joinability ?? undefined}
                  maxParticipants={habit.maxParticipants ?? undefined}
                />
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
