import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserTasks } from '@/server/queries/tasks'
import { HabitCard } from '@/components/cards/habit-card'
import { PageHeader, EmptyState } from '@/lib/ui'
import { OpenChatButton } from '@/components/chat/open-chat-button'
import { HabitAddButton } from '@/components/habits/habit-add-button'

export default async function HabitsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const allTasks = await getUserTasks()

  const habits = allTasks.filter((t) => t.type === 'habit')
  // TODO(Task 14): wire real per-task streaks via getTaskStreaks
  const streak = 0

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
            <HabitCard
              key={habit.id}
              taskId={habit.id}
              title={habit.title}
              status={habit.status}
              streak={streak}
            />
          ))}
        </div>
      )}
    </div>
  )
}
