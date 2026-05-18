import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserTasks } from '@/server/queries/tasks'
import { GoalCard } from '@/components/cards/goal-card'
import { PageHeader, EmptyState } from '@crawfordyoung/ui'

export default async function GoalsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const allTasks = await getUserTasks()
  const goals = allTasks.filter((t) => t.type === 'goal')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Goals" />
      {goals.length === 0 ? (
        <EmptyState message="No goals yet. Ask the AI to help you set one." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              taskId={goal.id}
              title={goal.title}
              progress={0}
              milestones={[]}
              targetDate={goal.targetDate?.toISOString().slice(0, 10) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
