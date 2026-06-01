'use client'
import type { Message, ToolInvocation } from 'ai'
import { TaskCard } from '@/components/cards/task-card'
import { HabitCard } from '@/components/cards/habit-card'
import { GoalCard } from '@/components/cards/goal-card'
import { ScheduleSuggestion } from '@/components/cards/schedule-suggestion'
import { ReflectionCard } from '@/components/cards/reflection-card'
import { WeekCalendarView } from '@/components/cards/week-calendar-view'
import { LifeBalanceView } from '@/components/cards/life-balance-view'
import { ActionConfirmCard } from '@/components/ui/action-confirm-card'

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
  readonly toolInvocation: ToolInvocation & { state: 'result' }
  readonly append?: (message: Pick<Message, 'role' | 'content'>) => void
}

export function ToolResultRenderer({ toolInvocation, append }: ToolResultRendererProps) {
  if (toolInvocation.toolName === 'proposeAction') {
    // Dynamic — result shape is defined by AI tool schema; validated at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = toolInvocation.result as any
    return (
      <ActionConfirmCard
        action={result.action}
        entityType={result.entityType}
        date={result.date}
        time={result.time}
        detail={result.detail}
        onConfirm={() => {
          append?.({ role: 'user', content: `[CONFIRM] ${result.action}` })
        }}
        onDeny={(reason: string) => {
          append?.({ role: 'user', content: reason ? `[DENY] reason: ${reason}` : '[DENY]' })
        }}
      />
    )
  }

  const Component = componentMap[toolInvocation.toolName as keyof typeof componentMap]
  if (!Component) return null
  // Dynamic dispatch — props match Component requirements by construction; union prevents precise typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Component {...(toolInvocation.result as any)} />
}
