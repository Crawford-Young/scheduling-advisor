'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  WeekCalendarView,
  toast,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  type CalendarEvent as LibraryCalendarEvent,
} from '@/lib/ui'
import { CheckInSheet } from '@/components/calendar/check-in-sheet'
import { PerfectWeekCelebration } from '@/components/calendar/perfect-week-celebration'
import { rescheduleTask } from '@/server/actions/consistency'
import { deleteTask } from '@/server/actions/tasks'

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
  const [deleteTarget, setDeleteTarget] = useState<LibraryCalendarEvent | null>(null)
  // Bumping resetKey remounts WeekCalendarView to resync it from the events prop:
  // the library applies move/resize/delete to internal state optimistically and never
  // re-derives from props, so router.refresh() alone cannot restore the view.
  // Side effect: remount resets in-calendar week navigation — acceptable on the rare
  // cancel/error/guard paths that bump it. confirmedRef keeps the confirm-success
  // close of the delete dialog from bumping (no flicker on successful delete).
  const [resetKey, setResetKey] = useState(0)
  const router = useRouter()
  const [, startTransition] = useTransition()
  const confirmedRef = React.useRef(false)

  const selectedEvent = events.find((e) => e.id === selectedId) ?? null

  function isCompleted(id: string): boolean {
    return events.find((e) => e.id === id)?.status === 'completed'
  }

  function handleConfirmDelete(): void {
    confirmedRef.current = true
    const target = deleteTarget
    setDeleteTarget(null)
    if (!target) return
    startTransition(async () => {
      const result = await deleteTask({ id: target.id })
      if ('error' in result) {
        toast.error('Could not delete event')
        setResetKey((k) => k + 1)
      }
      router.refresh()
    })
  }

  function handleTimeChange(libEvent: LibraryCalendarEvent): void {
    if (isCompleted(libEvent.id)) {
      setResetKey((k) => k + 1)
      router.refresh()
      return
    }
    startTransition(async () => {
      const result = await rescheduleTask({
        taskId: libEvent.id,
        newStartAt: new Date(libEvent.start).toISOString(),
        newEndAt: new Date(libEvent.end).toISOString(),
      })
      if ('error' in result) {
        toast.error('Could not reschedule — calendar restored')
        setResetKey((k) => k + 1)
      }
      router.refresh()
    })
  }

  return (
    <>
      <div data-testid="week-calendar">
        <WeekCalendarView
          key={`${weekStart}-${resetKey}`}
          defaultWeekStart={weekStart}
          events={events.map(toLibraryEvent)}
          onEventClick={(libEvent) => {
            const appEvent = events.find((e) => e.id === libEvent.id)
            if (appEvent && appEvent.status !== 'completed') setSelectedId(libEvent.id)
          }}
          onEventMove={handleTimeChange}
          onEventResize={handleTimeChange}
          onEventDelete={(e) => setDeleteTarget(e)}
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            if (!confirmedRef.current) setResetKey((k) => k + 1)
            confirmedRef.current = false
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deleteTarget?.title}&quot;? This removes the task and its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
