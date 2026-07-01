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
import { TaskFormDialog } from '@/components/tasks/task-form-dialog'
import { GoalFormDialog } from '@/components/goals/goal-form-dialog'
import { HabitFormDialog } from '@/components/habits/habit-form-dialog'
import { rescheduleTask } from '@/server/actions/consistency'
import { createTask, deleteTask } from '@/server/actions/tasks'

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

// Discriminated union for the single active dialog.
// Only one dialog can be open at a time; the union enforces this structurally.
type DialogState =
  | { mode: 'edit'; target: AppCalendarEvent }
  | { mode: 'delete'; target: LibraryCalendarEvent }
  | null

interface CalendarEventDialogsProps {
  readonly dialog: DialogState
  readonly onClose: () => void
  readonly onConfirmDelete: (target: LibraryCalendarEvent) => void
  readonly onDeleteOpenChange: (open: boolean) => void
}

function CalendarEventDialogs({
  dialog,
  onClose,
  onConfirmDelete,
  onDeleteOpenChange,
}: CalendarEventDialogsProps): React.JSX.Element {
  return (
    <>
      {dialog?.mode === 'edit' && dialog.target.type === 'task' && (
        <TaskFormDialog
          open
          onOpenChange={(open) => !open && onClose()}
          taskId={dialog.target.id}
          initialTitle={dialog.target.title}
          initialStartAt={dialog.target.start}
          initialEndAt={dialog.target.end}
        />
      )}
      {dialog?.mode === 'edit' && dialog.target.type === 'goal' && (
        <GoalFormDialog
          open
          onOpenChange={(open) => !open && onClose()}
          taskId={dialog.target.id}
          initialTitle={dialog.target.title}
          initialTargetDate={dialog.target.start.slice(0, 10)}
        />
      )}
      {dialog?.mode === 'edit' && dialog.target.type === 'habit' && (
        <HabitFormDialog
          open
          onOpenChange={(open) => !open && onClose()}
          taskId={dialog.target.id}
          initialTitle={dialog.target.title}
        />
      )}

      <AlertDialog open={dialog?.mode === 'delete'} onOpenChange={onDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{dialog?.mode === 'delete' ? dialog.target.title : ''}&quot;? This
              removes the task and its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => dialog?.mode === 'delete' && onConfirmDelete(dialog.target)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface CalendarClientProps {
  readonly weekStart: string
  readonly events: readonly AppCalendarEvent[]
}

export function CalendarClient({ weekStart, events }: CalendarClientProps): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [perfectWeekVisible, setPerfectWeekVisible] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  // Bumping resetKey remounts WeekCalendarView to resync it from the events prop:
  // the library applies move/resize/delete to internal state optimistically and never
  // re-derives from props, so router.refresh() alone cannot restore the view.
  // Side effect: remount resets in-calendar week navigation — acceptable on the rare
  // cancel/error/guard paths that bump it. confirmedRef keeps the confirm-success
  // close of the delete dialog from bumping (no flicker on successful delete).
  const [resetKey, setResetKey] = useState(0)
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Separate transition for create-dialog resync so bumping resetKey after
  // a create-close does not interfere with the delete/reschedule transition.
  const [isResyncing, startResyncTransition] = useTransition()
  const resyncQueuedRef = React.useRef(false)
  const confirmedRef = React.useRef(false)

  // When the resync transition (router.refresh inside startResyncTransition)
  // completes, isPending drops to false — bump resetKey so WeekCalendarView
  // remounts from the freshly-arrived events prop.
  React.useEffect(() => {
    if (!isResyncing && resyncQueuedRef.current) {
      resyncQueuedRef.current = false
      setResetKey((k) => k + 1)
    }
  }, [isResyncing])

  const selectedEvent = events.find((e) => e.id === selectedId) ?? null

  function isCompleted(id: string): boolean {
    return events.find((e) => e.id === id)?.status === 'completed'
  }

  function handleEventEdit(libEvent: LibraryCalendarEvent): void {
    const appEvent = events.find((e) => e.id === libEvent.id)
    if (!appEvent || appEvent.status === 'completed') return
    setDialog({ mode: 'edit', target: appEvent })
  }

  function handleConfirmDelete(target: LibraryCalendarEvent): void {
    confirmedRef.current = true
    setDialog(null)
    startTransition(async () => {
      const result = await deleteTask({ id: target.id })
      if ('error' in result) {
        toast.error('Could not delete event')
        setResetKey((k) => k + 1)
      }
      router.refresh()
    })
  }

  function handleDeleteOpenChange(open: boolean): void {
    if (!open) {
      setDialog(null)
      if (!confirmedRef.current) setResetKey((k) => k + 1)
      confirmedRef.current = false
    }
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

  function handleEventCreate(payload: Omit<LibraryCalendarEvent, 'id'>): void {
    resyncQueuedRef.current = true
    startResyncTransition(async () => {
      const result = await createTask({
        type: 'task',
        title: payload.title,
        startAt: new Date(payload.start).toISOString(),
        endAt: new Date(payload.end).toISOString(),
        allDay: payload.allDay ?? false,
        color: payload.color ?? null,
        location: payload.location ?? null,
        description: payload.description ?? null,
        recurrence: payload.recurrenceFrequency ?? null,
      })
      if ('error' in result) toast.error('Could not create event — calendar restored')
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
          onEventDelete={(e) => setDialog({ mode: 'delete', target: e })}
          onEventEdit={handleEventEdit}
          onEventCreate={handleEventCreate}
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

      <CalendarEventDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onConfirmDelete={handleConfirmDelete}
        onDeleteOpenChange={handleDeleteOpenChange}
      />
    </>
  )
}
