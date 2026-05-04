'use client'
import type { ToolInvocation } from 'ai'
import { TaskCard } from '@/components/tambo/task-card'
import { HabitCard } from '@/components/tambo/habit-card'
import { GoalCard } from '@/components/tambo/goal-card'
import { ScheduleSuggestion } from '@/components/tambo/schedule-suggestion'
import { ReflectionCard } from '@/components/tambo/reflection-card'
import { WeekCalendarView } from '@/components/tambo/week-calendar-view'
import { LifeBalanceView } from '@/components/tambo/life-balance-view'

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
  return <Component {...(toolInvocation.result as never)} />
}
