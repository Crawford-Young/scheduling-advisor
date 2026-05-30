'use client'
import * as React from 'react'
import { useState } from 'react'
import { WeekCalendarView } from '@/components/cards/week-calendar-view'
import { CheckInSheet } from '@/components/calendar/check-in-sheet'
import { PerfectWeekCelebration } from '@/components/calendar/perfect-week-celebration'

interface CalendarEvent {
  readonly id: string
  readonly title: string
  readonly start: string
  readonly end: string
  readonly type: 'task' | 'goal' | 'habit'
  readonly status: 'pending' | 'in_progress' | 'completed'
  readonly streak: number
  readonly activityType: string
  readonly visibility: string
}

interface CalendarClientProps {
  readonly weekStart: string
  readonly events: readonly CalendarEvent[]
}

export function CalendarClient({ weekStart, events }: CalendarClientProps): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [perfectWeekVisible, setPerfectWeekVisible] = useState(false)

  const selectedEvent = events.find((e) => e.id === selectedId) ?? null

  return (
    <>
      <div data-testid="week-calendar">
        <WeekCalendarView
          weekStart={weekStart}
          events={events as CalendarEvent[]}
          onEventClick={(event) => {
            if (event.status !== 'completed') setSelectedId(event.id)
          }}
        />
      </div>

      {selectedEvent && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-4 sm:right-4 sm:left-auto sm:max-w-sm">
          <CheckInSheet
            item={{
              taskId: selectedEvent.id,
              title: selectedEvent.title,
              status: selectedEvent.status,
            }}
            onClose={() => setSelectedId(null)}
            onPerfectWeek={() => {
              setSelectedId(null)
              setPerfectWeekVisible(true)
            }}
          />
        </div>
      )}

      <PerfectWeekCelebration
        visible={perfectWeekVisible}
        onDismiss={() => setPerfectWeekVisible(false)}
      />
    </>
  )
}
