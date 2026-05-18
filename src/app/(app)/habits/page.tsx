import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { userStats } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getUserTasks } from '@/server/queries/tasks'
import { HabitCard } from '@/components/cards/habit-card'
import { PageHeader, EmptyState } from '@/lib/ui'
import { OpenChatButton } from '@/components/chat/open-chat-button'

export default async function HabitsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [allTasks, stats] = await Promise.all([
    getUserTasks(),
    db.query.userStats.findFirst({ where: eq(userStats.userId, session.user.id) }),
  ])

  const habits = allTasks.filter((t) => t.type === 'habit')
  const streak = stats?.currentStreak ?? 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Habits" />
      {habits.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState message="No habits yet. Ask the AI to help you build one." />
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
