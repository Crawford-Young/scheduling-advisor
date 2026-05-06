'use client'
import type { ToolInvocation } from 'ai'
import { TaskCard } from '@/components/cards/task-card'
import { HabitCard } from '@/components/cards/habit-card'
import { GoalCard } from '@/components/cards/goal-card'
import { ScheduleSuggestion } from '@/components/cards/schedule-suggestion'
import { ReflectionCard } from '@/components/cards/reflection-card'
import { WeekCalendarView } from '@/components/cards/week-calendar-view'
import { LifeBalanceView } from '@/components/cards/life-balance-view'

const componentMap = {
  showTaskCard: TaskCard,
  showHabitCard: HabitCard,
  showGoalCard: GoalCard,
  showScheduleSuggestion: ScheduleSuggestion,
  showReflectionCard: ReflectionCard,
  showWeekCalendar: WeekCalendarView,
  showLifeBalance: LifeBalanceView,
} as const

interface ToolResultRendererProps {
  toolInvocation: ToolInvocation & { state: 'result' }
}

export function ToolResultRenderer({ toolInvocation }: ToolResultRendererProps) {
  const Component = componentMap[toolInvocation.toolName as keyof typeof componentMap]
  if (!Component) return null
  // Dynamic dispatch — props match Component requirements by construction; union prevents precise typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Component {...(toolInvocation.result as any)} />
}
