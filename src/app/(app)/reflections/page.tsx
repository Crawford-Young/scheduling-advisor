import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserCheckIns } from '@/server/queries/check-ins'
import { ReflectionCard } from '@/components/cards/reflection-card'
import { PageHeader, EmptyState } from '@crawfordyoung/ui'

export default async function ReflectionsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const allCheckIns = await getUserCheckIns()
  const completed = allCheckIns.filter((c) => c.completedAt !== null)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Reflections" />
      {completed.length === 0 ? (
        <EmptyState message="No reflections yet. Complete a check-in to see it here." />
      ) : (
        <div className="space-y-4">
          {completed.map((checkIn) => (
            <ReflectionCard
              key={checkIn.id}
              checkInId={checkIn.id}
              promptText="Daily reflection"
              taskTitle={null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
