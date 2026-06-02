'use client'
import * as React from 'react'
import { useState } from 'react'
import { WeekCalendarView, type CalendarEvent as LibraryCalendarEvent } from '@/lib/ui'
import { CheckInSheet } from '@/components/calendar/check-in-sheet'
import { PerfectWeekCelebration } from '@/components/calendar/perfect-week-celebration'

interface AppCalendarEvent {
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

function toLibraryColor(type: string): LibraryCalendarEvent['color'] {
  if (type === 'task') return 'blue'
  if (type === 'goal') return 'amber'
  if (type === 'habit') return 'green'
  return 'default'
}

function toLibraryEvent(e: AppCalendarEvent): LibraryCalendarEvent {
  return { id: e.id, title: e.title, start: e.start, end: e.end, color: toLibraryColor(e.type) }
}

interface CalendarClientProps {
  readonly weekStart: string
  readonly events: readonly AppCalendarEvent[]
}

export function CalendarClient({ weekStart, events }: CalendarClientProps): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [perfectWeekVisible, setPerfectWeekVisible] = useState(false)

  const selectedEvent = events.find((e) => e.id === selectedId) ?? null

  return (
    <>
      <div data-testid="week-calendar">
        <WeekCalendarView
          defaultWeekStart={weekStart}
          events={events.map(toLibraryEvent)}
          onEventClick={(libEvent) => {
            const appEvent = events.find((e) => e.id === libEvent.id)
            if (appEvent && appEvent.status !== 'completed') setSelectedId(libEvent.id)
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
