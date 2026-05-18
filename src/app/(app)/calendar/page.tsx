import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getUserTasks } from '@/server/queries/tasks'
import { WeekCalendarView } from '@/components/cards/week-calendar-view'
import { PageHeader } from '@/lib/ui'

function getCurrentWeekStart(): string {
  const now = new Date()
  const day = now.getDay() // 0 = Sunday
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

export default async function CalendarPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const weekStart = getCurrentWeekStart()
  const allTasks = await getUserTasks()

  const events = allTasks
    .filter((t) => t.targetDate !== null)
    .map((t) => {
      const dateStr = t.targetDate!.toISOString().slice(0, 10)
      return {
        id: t.id,
        title: t.title,
        start: `${dateStr}T09:00:00`,
        end: `${dateStr}T10:00:00`,
        type: 'task' as const,
      }
    })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Calendar" />
      <WeekCalendarView weekStart={weekStart} events={events} />
    </div>
  )
}
