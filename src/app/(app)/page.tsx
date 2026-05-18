import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { tasks, checkIns } from '@/db/schema'
import { eq, and, gte, lte, isNull } from 'drizzle-orm'
import { StatChip } from '@crawfordyoung/ui'
import { HeroCardCta } from '@/components/home/hero-card-cta'

function getWeekBounds(): { weekStart: Date; weekEnd: Date } {
  const now = new Date()
  const day = now.getDay() // 0 = Sunday
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { weekStart: monday, weekEnd: sunday }
}

export default async function HomePage(): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const { weekStart, weekEnd } = getWeekBounds()

  const weekTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        gte(tasks.targetDate, weekStart),
        lte(tasks.targetDate, weekEnd),
      ),
    )
    .limit(20)

  const [pendingCheckIn] = await db
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.userId, userId), isNull(checkIns.completedAt)))
    .limit(1)

  type State = 'plan' | 'reflect' | 'on_track'

  let state: State
  let headline: string
  let subtitle: string
  let ctaLabel: string

  if (weekTasks.length === 0) {
    state = 'plan'
    headline = 'Ready to plan your week?'
    subtitle = 'Let the AI help you schedule tasks, goals, and habits.'
    ctaLabel = 'Plan my week'
  } else if (pendingCheckIn) {
    state = 'reflect'
    headline = 'Time for your daily reflection'
    subtitle = 'How are you feeling about your progress today?'
    ctaLabel = 'Start reflection'
  } else {
    state = 'on_track'
    const done = weekTasks.filter((t) => t.status === 'completed').length
    headline = 'Your week is on track'
    subtitle = `${done} of ${weekTasks.length} tasks complete.`
    ctaLabel = 'Review week'
  }

  const doneCount = weekTasks.filter((t) => t.status === 'completed').length
  const remaining = weekTasks.length - doneCount

  const chips =
    state === 'plan'
      ? [{ label: 'Tasks this week', value: '0' }]
      : state === 'reflect'
        ? [
            { label: 'Tasks this week', value: String(weekTasks.length) },
            { label: 'Completed', value: String(doneCount) },
          ]
        : [
            { label: 'Tasks done', value: String(doneCount) },
            { label: 'Remaining', value: String(remaining) },
          ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <HeroCardCta headline={headline} subtitle={subtitle} ctaLabel={ctaLabel} />
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <StatChip key={c.label} label={c.label} value={c.value} />
        ))}
      </div>
    </div>
  )
}
