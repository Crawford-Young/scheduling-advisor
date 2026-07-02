'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  WeekCalendarView,
  SleepToggle,
  toast,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  Button,
  type CalendarEvent as LibraryCalendarEvent,
} from '@/lib/ui'
import { CheckInSheet } from '@/components/calendar/check-in-sheet'
import { PerfectWeekCelebration } from '@/components/calendar/perfect-week-celebration'
import {
  ActivityFormDialog,
  type ActivityFormValues,
  type ActivitySocial,
} from '@/components/activity/activity-form-dialog'
import { rescheduleTask } from '@/server/actions/consistency'
import { createTask, deleteTask, updateTask } from '@/server/actions/tasks'

// ─── Goal-date trap helper ────────────────────────────────────────────────────
// The app dialog emits targetDate as date-only YYYY-MM-DD.
// updateTask / createTask schemas require a full ISO datetime (.datetime()).
// Appending noon-UTC avoids the timezone offset that would push the date into
// the previous day in western timezones and also satisfies the Zod validator.
const TARGET_DATE_TIME_SUFFIX = 'T12:00:00.000Z'

function toIsoTargetDate(dateOnly: string | null | undefined): string | null {
  return dateOnly ? new Date(`${dateOnly}${TARGET_DATE_TIME_SUFFIX}`).toISOString() : null
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AppCalendarEvent {
  readonly id: string
  readonly title: string
  readonly start: string
  readonly end: string
  readonly type: 'task' | 'goal'
  readonly status: 'pending' | 'in_progress' | 'completed'
  readonly streak: number
  readonly activityType: string
  readonly visibility: string
  readonly color?: string | null
  readonly allDay?: boolean
  readonly location?: string | null
  readonly description?: string | null
  readonly recurrence?: string | null
}

// ─── Color mapping ────────────────────────────────────────────────────────────
// Prefer the event's persisted color (user-chosen) over the type-based default.

function toLibraryColor(type: 'task' | 'goal'): LibraryCalendarEvent['color'] {
  return type === 'goal' ? 'amber' : 'blue'
}

function toLibraryEvent(e: AppCalendarEvent): LibraryCalendarEvent {
  const color = e.color ? (e.color as LibraryCalendarEvent['color']) : toLibraryColor(e.type)
  return { id: e.id, title: e.title, start: e.start, end: e.end, color }
}

// ─── Dialog state (discriminated union) ──────────────────────────────────────
// Only one dialog can be open at a time; the union enforces this structurally.

type DialogState =
  | { mode: 'edit'; target: AppCalendarEvent }
  | { mode: 'delete'; target: LibraryCalendarEvent }
  | { mode: 'new' }
  | null

// ─── CalendarEventDialogs ─────────────────────────────────────────────────────

interface CalendarEventDialogsProps {
  readonly dialog: DialogState
  readonly onClose: () => void
  readonly onConfirmDelete: (target: LibraryCalendarEvent) => void
  readonly onDeleteOpenChange: (open: boolean) => void
  readonly onEditSubmit: (targetId: string, values: ActivityFormValues) => void
  readonly onNewSubmit: (values: ActivityFormValues) => void
  readonly isEditPending: boolean
  readonly isNewPending: boolean
}

function CalendarEventDialogs({
  dialog,
  onClose,
  onConfirmDelete,
  onDeleteOpenChange,
  onEditSubmit,
  onNewSubmit,
  isEditPending,
  isNewPending,
}: CalendarEventDialogsProps): React.JSX.Element {
  return (
    <>
      {/* ── + New activity dialog ── */}
      {dialog?.mode === 'new' && (
        <ActivityFormDialog
          open
          onOpenChange={(open) => !open && onClose()}
          onSubmit={onNewSubmit}
          isPending={isNewPending}
        />
      )}

      {/* ── Edit task dialog ── */}
      {dialog?.mode === 'edit' && dialog.target.type === 'task' && (
        <ActivityFormDialog
          open
          onOpenChange={(open) => !open && onClose()}
          onSubmit={(values) => onEditSubmit(dialog.target.id, values)}
          initialType="task"
          lockType
          isPending={isEditPending}
          initialValues={{
            type: 'task',
            title: dialog.target.title,
            startAt: dialog.target.start,
            endAt: dialog.target.end,
            recurrence: dialog.target.recurrence ?? undefined,
            color: dialog.target.color ?? undefined,
            allDay: dialog.target.allDay ?? false,
            location: dialog.target.location ?? undefined,
            description: dialog.target.description ?? undefined,
            social: {
              activityType: dialog.target.activityType as ActivitySocial['activityType'],
              visibility: dialog.target.visibility as ActivitySocial['visibility'],
            },
          }}
        />
      )}

      {/* ── Edit goal dialog ── */}
      {dialog?.mode === 'edit' && dialog.target.type === 'goal' && (
        <ActivityFormDialog
          open
          onOpenChange={(open) => !open && onClose()}
          onSubmit={(values) => onEditSubmit(dialog.target.id, values)}
          initialType="goal"
          lockType
          isPending={isEditPending}
          initialValues={{
            type: 'goal',
            title: dialog.target.title,
            // Date-only YYYY-MM-DD: ActivityFormDialog appends T12:00:00 internally
            // to avoid Invalid Date. A full ISO string would silently wipe the goal
            // target date on save (goal-date-wipe trap).
            targetDate: dialog.target.start.slice(0, 10),
            location: dialog.target.location ?? undefined,
            description: dialog.target.description ?? undefined,
            social: {
              activityType: dialog.target.activityType as ActivitySocial['activityType'],
              visibility: dialog.target.visibility as ActivitySocial['visibility'],
            },
          }}
        />
      )}

      {/* ── Delete confirmation ── */}
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

// ─── CalendarClient ───────────────────────────────────────────────────────────

interface CalendarClientProps {
  readonly weekStart: string
  readonly events: readonly AppCalendarEvent[]
  readonly wakeHour: number
  readonly sleepHour: number
}

export function CalendarClient({
  weekStart,
  events,
  wakeHour,
  sleepHour,
}: CalendarClientProps): React.JSX.Element {
  const [showFullDay, setShowFullDay] = useState(false)
  const hourStart = showFullDay ? 0 : wakeHour
  const hourCount = showFullDay ? 24 : sleepHour - wakeHour
  const sleepEnabled = showFullDay
  const sleepStart = sleepHour
  const sleepEnd = wakeHour
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
  const [isEditPending, startEditTransition] = useTransition()
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

  function handleEditSubmit(targetId: string, values: ActivityFormValues): void {
    startEditTransition(async () => {
      const result = await updateTask(
        values.type === 'goal'
          ? {
              id: targetId,
              title: values.title,
              // Goal-date trap: convert date-only YYYY-MM-DD → noon-UTC ISO.
              // The updateTask Zod schema (.datetime()) rejects date-only strings.
              targetDate: toIsoTargetDate(values.targetDate),
              location: values.location ?? null,
              description: values.description ?? null,
            }
          : {
              id: targetId,
              title: values.title,
              recurrence: values.recurrence ?? null,
              startAt: values.startAt ?? null,
              endAt: values.endAt ?? null,
              color: values.color ?? null,
              location: values.location ?? null,
              description: values.description ?? null,
              allDay: values.allDay,
            },
      )
      if ('error' in result) {
        toast.error('Could not save activity')
        return
      }
      setDialog(null)
      router.refresh()
    })
  }

  function handleNewSubmit(values: ActivityFormValues): void {
    setDialog(null)
    resyncQueuedRef.current = true
    startResyncTransition(async () => {
      const result = await createTask(
        values.type === 'goal'
          ? {
              type: 'goal' as const,
              title: values.title,
              // Goal-date trap: same conversion required for createTask.
              targetDate: toIsoTargetDate(values.targetDate),
              location: values.location ?? null,
              description: values.description ?? null,
              recurrence: null,
              allDay: false,
              color: null,
            }
          : {
              type: 'task' as const,
              title: values.title,
              startAt: values.startAt ?? null,
              endAt: values.endAt ?? null,
              color: values.color ?? null,
              location: values.location ?? null,
              description: values.description ?? null,
              allDay: values.allDay ?? false,
              recurrence: values.recurrence ?? null,
              recurrenceCount: values.recurrenceCount,
            },
      )
      if ('error' in result) toast.error('Could not create activity')
      router.refresh()
    })
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-end gap-4">
        <SleepToggle enabled={!showFullDay} onToggle={(windowed) => setShowFullDay(!windowed)} />
        <Button type="button" onClick={() => setDialog({ mode: 'new' })}>
          + New
        </Button>
      </div>

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
          hourStart={hourStart}
          hourCount={hourCount}
          sleepEnabled={sleepEnabled}
          sleepStart={sleepStart}
          sleepEnd={sleepEnd}
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
        onEditSubmit={handleEditSubmit}
        onNewSubmit={handleNewSubmit}
        isEditPending={isEditPending}
        isNewPending={isResyncing}
      />
    </>
  )
}
