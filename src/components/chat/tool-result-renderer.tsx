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

export interface AppEvent {
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
  showLifeBalance: LifeBalanceView,
} as const

export interface ToolResultRendererProps {
  readonly toolInvocation: ToolInvocation & { state: 'result' }
  readonly append?: (message: Pick<Message, 'role' | 'content'>) => void
  readonly onScheduleUpdate?: (weekStart: string, events: readonly AppEvent[]) => void
  readonly onItemConfirmed?: (
    action: string,
    entityType: 'habit' | 'goal' | 'event',
    date?: string,
    time?: string,
  ) => void
}

export function ToolResultRenderer({
  toolInvocation,
  append,
  onScheduleUpdate,
  onItemConfirmed,
}: ToolResultRendererProps) {
  if (toolInvocation.toolName === 'showWeekCalendar') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = toolInvocation.result as any
    onScheduleUpdate?.(result.weekStart, result.events ?? [])
    return <WeekCalendarRenderer weekStart={result.weekStart} events={result.events} />
  }

  if (toolInvocation.toolName === 'proposeAction') {
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
          onItemConfirmed?.(result.action, result.entityType, result.date, result.time)
        }}
        onDeny={(reason: string) => {
          append?.({ role: 'user', content: reason ? `[DENY] reason: ${reason}` : '[DENY]' })
        }}
      />
    )
  }

  const Component = componentMap[toolInvocation.toolName as keyof typeof componentMap]
  if (!Component) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Component {...(toolInvocation.result as any)} />
}
