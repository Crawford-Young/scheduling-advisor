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
  type CalendarEvent as LibraryCalendarEvent,
  type DayWindow,
} from '@/lib/ui'
import { rescheduleTask, recordCompletion } from '@/server/actions/consistency'
import { createTask, deleteTask, updateTask } from '@/server/actions/tasks'

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

// ─── Recurrence mapping (app ↔ library) ───────────────────────────────────────
// The app `recurrence` column stores the frequency string verbatim, which is
// exactly the library's `recurrenceFrequency` union. This is the single
// bidirectional mapping:
//   • app → lib: validate the stored string is a known frequency (else undefined).
//   • lib → app: `recurrenceFrequency ?? null` (done inline at the call sites).

const LIB_RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const

function toLibraryRecurrenceFrequency(
  recurrence: string | null | undefined,
): LibraryCalendarEvent['recurrenceFrequency'] {
  return recurrence !== null &&
    recurrence !== undefined &&
    (LIB_RECURRENCE_FREQUENCIES as readonly string[]).includes(recurrence)
    ? (recurrence as LibraryCalendarEvent['recurrenceFrequency'])
    : undefined
}

// ─── Color mapping ────────────────────────────────────────────────────────────
// Prefer the event's persisted color (user-chosen). A falsy persisted color
// means the popover's default (pre-selected) swatch was used, which the
// library's create-form emits as `undefined` and the app persists as `null`.
// The library's own semantics for a missing color are the literal 'default'
// variant (its chip does `ev.color ?? 'default'`) — fall back to that literal,
// not a type-based blue/amber guess, or the chip flips color after refresh.

function toLibraryEvent(e: AppCalendarEvent): LibraryCalendarEvent {
  const color = e.color ? (e.color as LibraryCalendarEvent['color']) : 'default'
  return {
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    color,
    allDay: e.allDay ?? undefined,
    location: e.location ?? undefined,
    description: e.description ?? undefined,
    // Completion contract (0.17.0): the chip renders a one-click complete circle
    // (opt-in via `completable`) and a flame+count when `streak > 0`. `completed`
    // drives the filled-circle state; toggling it fires onEventToggleComplete.
    completed: e.status === 'completed',
    completable: true,
    streak: e.streak,
    // Round-trip the frequency so the chip's edit form seeds the Repeat select.
    recurrenceFrequency: toLibraryRecurrenceFrequency(e.recurrence),
    // recurrenceDays is intentionally omitted: each stored row is a standalone
    // fanned occurrence (see createTask weekday fan-out), so it has no per-week
    // day set of its own — leaving it undefined keeps the chip on its own day.
  }
}

// ─── CalendarClient ───────────────────────────────────────────────────────────

interface CalendarClientProps {
  readonly weekStart: string
  readonly events: readonly AppCalendarEvent[]
  readonly wakeHour: number
  readonly sleepHour: number
  /** Per-day awake windows in fractional hours, Sun-first (7 entries). */
  readonly dayWindows: readonly DayWindow[]
  /** Render task times as 24-hour instead of 12-hour with AM/PM. */
  readonly use24h: boolean
}

export function CalendarClient({
  weekStart,
  events,
  wakeHour,
  sleepHour,
  dayWindows,
  use24h,
}: CalendarClientProps): React.JSX.Element {
  const [showFullDay, setShowFullDay] = useState(false)
  const hourStart = showFullDay ? 0 : wakeHour
  const hourCount = showFullDay ? 24 : sleepHour - wakeHour
  const sleepEnabled = showFullDay
  const sleepStart = sleepHour
  const sleepEnd = wakeHour
  // Only the delete-confirm dialog is app-owned now. Create and edit both live
  // entirely in the library's chip/drag-create popover (calendar uses library
  // UI exclusively). null = no dialog open.
  const [deleteTarget, setDeleteTarget] = useState<LibraryCalendarEvent | null>(null)
  // Bumping resetKey remounts WeekCalendarView to resync it from the events prop:
  // the library applies move/resize/edit/delete to internal state optimistically and
  // never re-derives from props, so router.refresh() alone cannot restore the view.
  // Side effect: remount resets in-calendar week navigation — acceptable on the rare
  // cancel/error/guard paths that bump it. confirmedRef keeps the confirm-success
  // close of the delete dialog from bumping (no flicker on successful delete).
  const [resetKey, setResetKey] = useState(0)
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Separate transition for create-drag resync so bumping resetKey after
  // a create does not interfere with the delete/reschedule transition.
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

  function isCompleted(id: string): boolean {
    return events.find((e) => e.id === id)?.status === 'completed'
  }

  // The library chip popover owns the edit form; onEventEdit delivers the
  // FINISHED edit to persist (already applied optimistically to the library's
  // internal state). Mirror handleTimeChange's error handling: toast + resetKey
  // bump on error, router.refresh always. Completed events cannot be edited —
  // restore by remounting, like the completed move guard.
  function handleEventEdit(libEvent: LibraryCalendarEvent): void {
    if (isCompleted(libEvent.id)) {
      setResetKey((k) => k + 1)
      router.refresh()
      return
    }
    startTransition(async () => {
      const result = await updateTask({
        id: libEvent.id,
        title: libEvent.title,
        startAt: new Date(libEvent.start).toISOString(),
        endAt: new Date(libEvent.end).toISOString(),
        color: libEvent.color ?? null,
        location: libEvent.location ?? null,
        description: libEvent.description ?? null,
        recurrence: libEvent.recurrenceFrequency ?? null,
        allDay: libEvent.allDay ?? false,
      })
      if ('error' in result) {
        toast.error('Could not save event — calendar restored')
        setResetKey((k) => k + 1)
      }
      router.refresh()
    })
  }

  function handleConfirmDelete(target: LibraryCalendarEvent): void {
    confirmedRef.current = true
    setDeleteTarget(null)
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
      setDeleteTarget(null)
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

  // The chip's complete circle (0.17.0) fires onEventToggleComplete with the
  // TOGGLED event (WeekCalendarView flips `completed` before calling back), so
  // `libEvent.completed` is the direction the user wants NOW: true = complete,
  // false = un-complete. Completing mirrors useActivityActions.handleComplete:
  // recurring tasks log an occurrence via recordCompletion, non-recurring
  // tasks/goals flip status via updateTask. Un-completing always goes through
  // updateTask({status:'pending'}) for BOTH kinds — there is no undo-completion
  // primitive (recordCompletion outcomes are only 'done'|'skip') and streak
  // history is deliberately left untouched (append-only by design). On
  // failure, remount to restore the chip's optimistic state (calendar pattern).
  function handleEventToggleComplete(libEvent: LibraryCalendarEvent): void {
    const isRecurring = events.find((e) => e.id === libEvent.id)?.recurrence != null
    const isCompleting = libEvent.completed === true
    startTransition(async () => {
      const result = isCompleting
        ? isRecurring
          ? await recordCompletion({ taskId: libEvent.id, outcome: 'done' })
          : await updateTask({ id: libEvent.id, status: 'completed' })
        : await updateTask({ id: libEvent.id, status: 'pending' })
      if ('error' in result) {
        toast.error(
          isCompleting
            ? isRecurring
              ? 'Could not log completion'
              : 'Could not mark complete'
            : 'Could not mark incomplete',
        )
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
        // Selected weekdays from a multi-day drag: createTask fans out one row
        // per weekday when recurrence === 'weekly'.
        recurrenceDays: payload.recurrenceDays,
      })
      if ('error' in result) toast.error('Could not create event — calendar restored')
      router.refresh()
    })
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-end gap-4">
        <SleepToggle enabled={!showFullDay} onToggle={(windowed) => setShowFullDay(!windowed)} />
      </div>

      <div data-testid="week-calendar">
        <WeekCalendarView
          key={`${weekStart}-${resetKey}`}
          defaultWeekStart={weekStart}
          events={events.map(toLibraryEvent)}
          onEventMove={handleTimeChange}
          onEventResize={handleTimeChange}
          onEventDelete={(e) => setDeleteTarget(e)}
          onEventEdit={handleEventEdit}
          onEventCreate={handleEventCreate}
          onEventToggleComplete={handleEventToggleComplete}
          hourStart={hourStart}
          hourCount={hourCount}
          sleepEnabled={sleepEnabled}
          sleepStart={sleepStart}
          sleepEnd={sleepEnd}
          dayWindows={dayWindows}
          use24h={use24h}
        />
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={handleDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deleteTarget?.title ?? ''}&quot;? This removes the task and its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && handleConfirmDelete(deleteTarget)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
