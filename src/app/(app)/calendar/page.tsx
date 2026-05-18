import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { WeekCalendarView } from '@/components/cards/week-calendar-view'
import { PageHeader } from '@crawfordyoung/ui'

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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Calendar" />
      <WeekCalendarView weekStart={weekStart} events={[]} />
    </div>
  )
}
