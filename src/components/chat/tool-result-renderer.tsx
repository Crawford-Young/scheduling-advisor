'use client'
import * as React from 'react'
import type { Message, ToolInvocation } from 'ai'
import { TaskCard } from '@/components/cards/task-card'
import { HabitCard } from '@/components/cards/habit-card'
import { GoalCard } from '@/components/cards/goal-card'
import { ScheduleSuggestion } from '@/components/cards/schedule-suggestion'
import { ReflectionCard } from '@/components/cards/reflection-card'
import { LifeBalanceView } from '@/components/cards/life-balance-view'
import { ActionConfirmCard } from '@/components/chat/action-confirm-card'
import { WeekCalendarView, type CalendarEvent as LibraryCalendarEvent } from '@/lib/ui'

interface AppEvent {
  readonly id: string
  readonly title: string
  readonly start: string
  readonly end: string
  readonly type: 'calendar' | 'task' | 'goal' | 'habit'
}

function toLibraryColor(type: string): LibraryCalendarEvent['color'] {
  if (type === 'task') return 'blue'
  if (type === 'goal') return 'amber'
  if (type === 'habit') return 'green'
  return 'default'
}

function toLibraryEvent(e: AppEvent): LibraryCalendarEvent {
  return { id: e.id, title: e.title, start: e.start, end: e.end, color: toLibraryColor(e.type) }
}

interface WeekCalendarProps {
  readonly weekStart?: string
  readonly events?: readonly AppEvent[]
}

function WeekCalendarRenderer({ weekStart, events = [] }: WeekCalendarProps): React.JSX.Element {
  return <WeekCalendarView defaultWeekStart={weekStart} events={events.map(toLibraryEvent)} />
}

const componentMap = {
  showTaskCard: TaskCard,
  showHabitCard: HabitCard,
  showGoalCard: GoalCard,
  showScheduleSuggestion: ScheduleSuggestion,
  showReflectionCard: ReflectionCard,
  showWeekCalendar: WeekCalendarRenderer,
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
