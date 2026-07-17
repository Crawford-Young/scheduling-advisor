'use client'
import * as React from 'react'
import type { Message, ToolInvocation } from 'ai'
import { ScheduleSuggestion } from '@/components/cards/schedule-suggestion'
import { ReflectionCard } from '@/components/cards/reflection-card'
import { LifeBalanceView } from '@/components/cards/life-balance-view'
import { ActionConfirmCard } from '@/components/chat/action-confirm-card'
import { EventProposalCard, type RecurrenceFrequency } from '@/components/chat/event-proposal-card'
import { DayProposalPreview } from '@/components/chat/day-proposal-preview'
import type { DayOfWeek } from '@/lib/schemas/task'
import {
  ActivityCard,
  WeekCalendarView,
  type CalendarEvent as LibraryCalendarEvent,
} from '@/lib/ui'

type ActivityType = 'task' | 'goal' | 'habit'
type ActivityStatus = 'pending' | 'in_progress' | 'completed'

/** Chat tool results are read-only previews — ActivityCard with a detail slot, no actions. */
function detailLine(text: string): React.JSX.Element {
  return <span className="text-muted-foreground text-xs">{text}</span>
}

interface ChatTaskCardProps {
  readonly title: string
  readonly type: ActivityType
  readonly status: ActivityStatus
  readonly nextSlot?: string | null
}

function ChatTaskCard({ title, type, status, nextSlot }: ChatTaskCardProps): React.JSX.Element {
  return (
    <ActivityCard
      title={title}
      type={type}
      status={status}
      visibility="only_me"
      detail={nextSlot ? detailLine(`Next: ${nextSlot}`) : undefined}
    />
  )
}

interface ChatHabitCardProps {
  readonly title: string
  readonly status: ActivityStatus
  readonly streak: number
}

function ChatHabitCard({ title, status, streak }: ChatHabitCardProps): React.JSX.Element {
  return (
    <ActivityCard title={title} type="habit" status={status} streak={streak} visibility="only_me" />
  )
}

interface ChatGoalCardProps {
  readonly title: string
  readonly status: ActivityStatus
  readonly targetDate?: string | null
}

function ChatGoalCard({ title, status, targetDate }: ChatGoalCardProps): React.JSX.Element {
  return (
    <ActivityCard
      title={title}
      type="goal"
      status={status}
      visibility="only_me"
      detail={targetDate ? detailLine(`Target: ${targetDate}`) : undefined}
    />
  )
}

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
  showTaskCard: ChatTaskCard,
  showHabitCard: ChatHabitCard,
  showGoalCard: ChatGoalCard,
  showScheduleSuggestion: ScheduleSuggestion,
  showReflectionCard: ReflectionCard,
  showLifeBalance: LifeBalanceView,
} as const

/** A calendar event Cy proposed via `proposeEvent`, surfaced on card mount. */
export interface EventProposal {
  readonly toolCallId: string
  readonly title: string
  readonly date: string
  readonly start: string
  readonly end: string
  // Carried across the popup → /chat expand handoff so the re-rendered card keeps
  // its description line at parity with the popup.
  readonly description?: string
  // Present when Cy proposed a recurring series (a single call). The right-panel
  // ghost still renders the anchor day only (v1); the confirmed series lands from
  // real rows after createTask's fan-out.
  readonly recurrence?: RecurrenceFrequency
  readonly recurrenceDays?: readonly DayOfWeek[]
  readonly recurrenceCount?: number
}

/** The calendar row created when an event proposal is confirmed. */
export interface CreatedEvent {
  readonly id: string
  readonly title: string
  readonly start: string
  readonly end: string
}

interface ProposeEventResultProps {
  readonly toolCallId: string
  readonly result: {
    readonly title: string
    readonly date: string
    readonly start: string
    readonly end: string
    readonly description?: string
    readonly recurrence?: RecurrenceFrequency
    readonly recurrenceDays?: readonly DayOfWeek[]
    readonly recurrenceCount?: number
  }
  readonly append?: (message: Pick<Message, 'role' | 'content'>) => void
  readonly onEventProposed?: (proposal: EventProposal) => void
  readonly onEventResolved?: (
    toolCallId: string,
    outcome: 'confirmed' | 'denied',
    created?: CreatedEvent,
  ) => void
  // Popup-only: slot a DayProposalPreview under the card so the proposal is seen
  // in the context of the day. The full-page surface renders its own right-panel
  // preview instead, so it leaves this unset.
  readonly inlineDayPreview?: boolean
}

/**
 * Wraps `EventProposalCard` so the mount-time `onEventProposed` notification and
 * the `onEventResolved` mapping live where the `toolCallId` is known. The effect
 * fires once on mount (never during render — unlike the legacy `onScheduleUpdate`
 * render-time call below, which is not the pattern to copy). Local `previewState`
 * mirrors the card's internal resolution (ghost → confirmed on confirm, ghost →
 * removed on deny) to drive the slotted `DayProposalPreview`.
 */
export function ProposeEventResult({
  toolCallId,
  result,
  append,
  onEventProposed,
  onEventResolved,
  inlineDayPreview,
}: ProposeEventResultProps): React.JSX.Element {
  const { title, date, start, end, description, recurrence, recurrenceDays, recurrenceCount } =
    result
  const [previewState, setPreviewState] = React.useState<'ghost' | 'confirmed' | 'removed'>('ghost')
  React.useEffect(() => {
    onEventProposed?.({
      toolCallId,
      title,
      date,
      start,
      end,
      description,
      recurrence,
      recurrenceDays,
      recurrenceCount,
    })
    // Fire once on mount with the proposal identity; deps intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <EventProposalCard
      title={title}
      date={date}
      start={start}
      end={end}
      description={description}
      recurrence={recurrence}
      recurrenceDays={recurrenceDays}
      recurrenceCount={recurrenceCount}
      append={append}
      onConfirmed={(created) => {
        setPreviewState('confirmed')
        onEventResolved?.(toolCallId, 'confirmed', created)
      }}
      onDenied={() => {
        setPreviewState('removed')
        onEventResolved?.(toolCallId, 'denied')
      }}
      preview={
        inlineDayPreview ? (
          <DayProposalPreview
            date={date}
            proposal={{ title, start, end }}
            state={previewState}
            recurrence={recurrence}
          />
        ) : undefined
      }
    />
  )
}

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
  readonly onEventProposed?: (proposal: EventProposal) => void
  readonly onEventResolved?: (
    toolCallId: string,
    outcome: 'confirmed' | 'denied',
    created?: CreatedEvent,
  ) => void
  readonly inlineDayPreview?: boolean
}

export function ToolResultRenderer({
  toolInvocation,
  append,
  onScheduleUpdate,
  onItemConfirmed,
  onEventProposed,
  onEventResolved,
  inlineDayPreview,
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

  if (toolInvocation.toolName === 'proposeEvent') {
    const result = toolInvocation.result as ProposeEventResultProps['result']
    return (
      <ProposeEventResult
        toolCallId={toolInvocation.toolCallId}
        result={result}
        append={append}
        onEventProposed={onEventProposed}
        onEventResolved={onEventResolved}
        inlineDayPreview={inlineDayPreview}
      />
    )
  }

  const Component = componentMap[toolInvocation.toolName as keyof typeof componentMap]
  if (!Component) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Component {...(toolInvocation.result as any)} />
}
