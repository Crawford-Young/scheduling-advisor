'use client'
import * as React from 'react'
import { WeekCalendarView, type CalendarEvent } from '@/lib/ui'

export interface ScheduleState {
  readonly visible: boolean
  readonly weekStart: string
  readonly events: readonly CalendarEvent[]
}

export interface SchedulePanelProps {
  readonly state: ScheduleState
}

export function SchedulePanel({ state }: SchedulePanelProps): React.JSX.Element | null {
  if (!state.visible) return null

  return (
    <div className="border-border flex h-full flex-col overflow-hidden border-l">
      <WeekCalendarView defaultWeekStart={state.weekStart} events={state.events} />
    </div>
  )
}
