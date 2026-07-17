'use client'
import * as React from 'react'
import { CalendarDays } from 'lucide-react'
import { WeekCalendarView, type CalendarEvent } from '@/lib/ui'

export interface ScheduleState {
  readonly visible: boolean
  readonly weekStart: string
  readonly events: readonly CalendarEvent[]
}

export interface SchedulePanelProps {
  readonly state: ScheduleState
  /**
   * Identity-changing counter forwarded to `WeekCalendarView.resyncToken`. The
   * library seeds its internal event state once and only re-seeds from the
   * `events` prop when this token's identity changes — so every schedule-state
   * mutation (ghost added/replaced/dropped) must arrive with a fresh token.
   */
  readonly resyncToken?: number
}

function SchedulePanelEmptyState(): React.JSX.Element {
  return (
    <div className="border-border flex h-full w-full flex-col items-center justify-center gap-3 border-l p-6 text-center">
      <CalendarDays className="text-muted-foreground h-8 w-8" aria-hidden />
      <h2 className="text-foreground text-sm font-medium">Schedule preview</h2>
      <p className="text-muted-foreground max-w-xs text-sm">
        When Cy proposes times or shows your week, it appears here.
      </p>
    </div>
  )
}

export function SchedulePanel({ state, resyncToken }: SchedulePanelProps): React.JSX.Element {
  if (!state.visible) return <SchedulePanelEmptyState />

  return (
    <div className="border-border flex h-full w-full flex-col overflow-hidden border-l">
      <div className="min-h-0 w-full flex-1 overflow-auto">
        <WeekCalendarView
          defaultWeekStart={state.weekStart}
          events={state.events}
          resyncToken={resyncToken}
        />
      </div>
    </div>
  )
}
