import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserTasks } from '@/server/queries/tasks'
import { GoalCard } from '@/components/cards/goal-card'
import { PageHeader, EmptyState } from '@/lib/ui'
import { OpenChatButton } from '@/components/chat/open-chat-button'

export default async function GoalsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const allTasks = await getUserTasks()
  const goals = allTasks.filter((t) => t.type === 'goal')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Goals" />
      {goals.length === 0 ? (
        <div className="flex flex-col items-center gap-4">
          <EmptyState message="No goals yet. Ask the AI to help you set one." />
          <OpenChatButton label="Set a goal with AI" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              taskId={goal.id}
              title={goal.title}
              status={goal.status}
              targetDate={goal.targetDate?.toISOString().slice(0, 10) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
