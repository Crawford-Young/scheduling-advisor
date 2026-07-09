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
  type DayOfWeek,
} from '@/lib/ui'
import { rescheduleTask, recordCompletion } from '@/server/actions/consistency'
import { createTask, deleteTask, updateTask, updateTaskSeries } from '@/server/actions/tasks'

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
  /**
   * Persisted weekday set for a weekly series row (jsonb `recurrence_days`).
   * Seeds the chip edit popover's Days picker via the library `seriesDays` field
   * and drives set-equality routing in handleEventEdit.
   */
  readonly recurrenceDays?: readonly DayOfWeek[] | null
  /**
   * Pins the row in place (jsonb `locked` column). Seeds the library chip's lock
   * state; the lock toggle flips this and persists it via updateTask.
   */
  readonly locked?: boolean
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

// The subset of frequencies updateTaskSeries can regenerate (its schema is a
// daily|weekly|monthly enum — 'yearly' never fans out, so it is not a series).
const SERIES_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const
type SeriesFrequency = (typeof SERIES_FREQUENCIES)[number]

function isSeriesFrequency(value: string | null | undefined): value is SeriesFrequency {
  return value != null && (SERIES_FREQUENCIES as readonly string[]).includes(value)
}

// Order-insensitive equality for two weekday-token sets. The library seeds the
// chip picker from `seriesDays` and re-emits the selection under `recurrenceDays`
// on EVERY save, so routing must compare the emitted set against the persisted
// set by membership (not presence) — a reordered but unchanged set is NOT an edit.
function sameDaySet(a: readonly DayOfWeek[], b: readonly DayOfWeek[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((day) => setB.has(day))
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
    // Seed the chip edit popover's Days picker from the row's persisted weekday
    // set via `seriesDays` (0.18.0), NOT the library's own `recurrenceDays`
    // field. `recurrenceDays` drives WeekCalendarView's DISPLAY fan-out (one
    // chip per day), but each stored row is already a single fanned occurrence,
    // so seeding recurrenceDays would double-render the chip across the week.
    // `seriesDays` is decoupled: it pre-fills the picker only. handleEventEdit
    // then re-emits the selection under recurrenceDays and routes by set
    // equality against this same persisted set (see the trap note there).
    seriesDays: e.recurrenceDays ?? undefined,
    // Lock state (0.19.0): drives the chip's lock affordance; the library gates
    // start/end edits on locked rows client-side.
    locked: e.locked ?? undefined,
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
  // resyncToken (0.20.0) re-seeds WeekCalendarView from the events prop WITHOUT
  // remounting: the library applies move/resize/edit/delete to internal state
  // optimistically and never re-derives from props on its own, so router.refresh()
  // alone cannot restore the view. Bumping the token's identity forces the re-seed
  // while preserving in-calendar week navigation — the reason the old key-remount
  // machinery was removed. confirmedRef keeps the confirm-success close of the
  // delete dialog from firing a second (immediate) bump on top of the confirm
  // path's refresh-then-settle bump.
  const [resyncToken, setResyncToken] = useState(0)
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Tracks the router.refresh transition so the token bump waits until the fresh
  // events prop has actually arrived — bumping synchronously would re-seed from
  // the STALE props (the trap the old create-path machinery solved for).
  const [isRefreshing, startRefreshTransition] = useTransition()
  const refreshQueuedRef = React.useRef(false)
  const confirmedRef = React.useRef(false)

  // When the refresh transition settles, isRefreshing drops to false — bump the
  // token so WeekCalendarView re-seeds from the freshly-arrived events prop.
  React.useEffect(() => {
    if (!isRefreshing && refreshQueuedRef.current) {
      refreshQueuedRef.current = false
      setResyncToken((t) => t + 1)
    }
  }, [isRefreshing])

  // Every server-mutating path (success OR error) ends here: refresh, then bump
  // the token once the new events prop has arrived.
  function refreshAndResync(): void {
    refreshQueuedRef.current = true
    startRefreshTransition(() => {
      router.refresh()
    })
  }

  // Guard/cancel paths make no server call — props already hold truth, so re-seed
  // the library immediately with no refresh round-trip.
  function resyncNow(): void {
    setResyncToken((t) => t + 1)
  }

  function isCompleted(id: string): boolean {
    return events.find((e) => e.id === id)?.status === 'completed'
  }

  // The library chip popover owns the edit form; onEventEdit delivers the
  // FINISHED edit to persist (already applied optimistically to the library's
  // internal state). Mirror handleTimeChange's error handling: toast on error,
  // refreshAndResync on every persist path. Completed events cannot be edited —
  // restore immediately via resyncNow, like the completed move guard.
  function handleEventEdit(libEvent: LibraryCalendarEvent): void {
    if (isCompleted(libEvent.id)) {
      resyncNow()
      return
    }
    startTransition(async () => {
      // Series-shaped vs row-shaped routing. The chip popover emits both the
      // recurrence PATTERN (frequency + a weekday set) and row-shaped fields
      // (time/title/color) in one save. A change to the pattern of an existing
      // series regenerates the group's future pending rows via updateTaskSeries;
      // a plain time/field change keeps the single-row updateTask path.
      //
      // Detection (S9): the picker is now SEEDED (toLibraryEvent seeds seriesDays
      // from the persisted set), so handleSave re-emits recurrenceDays on every
      // save. Presence is therefore no signal — route on order-insensitive SET
      // EQUALITY against the row's persisted recurrenceDays: only a genuinely
      // changed set counts as a pattern edit. A differing frequency also counts.
      // Both are only meaningful on a row that is already recurring (else there
      // is no group for updateTaskSeries to anchor).
      //
      // Mixed edit (a pattern change AND a row-shaped change in the same save):
      // the series change owns the save — updateTaskSeries regenerates from the
      // anchor row's persisted time/title, and the co-changed row-shaped fields
      // are NOT separately written here. This is the interim state until S9 lands
      // the library's seriesDays edit-seed and a unified series-edit form.
      //
      // S10: setting a series frequency on a NON-recurring event ALSO routes to
      // updateTaskSeries, which materializes the series (updates the anchor in
      // place and fans out future occurrences). Clearing recurrence on an
      // already-recurring event (freq drops to a non-series value) stays on
      // updateTask — that direction is unchanged. Goals are never a series:
      // pre-S10 the wasRecurring gate implicitly excluded them (goals are never
      // recurring), so the added !wasRecurring materialize arm needs its own
      // explicit exclusion here (mirrors use-activity-actions' `type !== 'goal'`).
      const original = events.find((e) => e.id === libEvent.id)
      const freq = libEvent.recurrenceFrequency
      const emittedDays = libEvent.recurrenceDays ?? []
      const persistedDays = original?.recurrenceDays ?? []
      const daysChanged = !sameDaySet(emittedDays, persistedDays)
      const recurrenceChanged = (freq ?? null) !== (original?.recurrence ?? null)
      const wasRecurring = original?.recurrence != null

      const result =
        original?.type !== 'goal' &&
        isSeriesFrequency(freq) &&
        (!wasRecurring || daysChanged || recurrenceChanged)
          ? await updateTaskSeries({
              taskId: libEvent.id,
              recurrence: freq,
              recurrenceDays: emittedDays.length > 0 ? emittedDays : undefined,
            })
          : await updateTask({
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
      }
      refreshAndResync()
    })
  }

  function handleConfirmDelete(target: LibraryCalendarEvent): void {
    confirmedRef.current = true
    setDeleteTarget(null)
    startTransition(async () => {
      const result = await deleteTask({ id: target.id })
      if ('error' in result) {
        toast.error('Could not delete event')
      }
      refreshAndResync()
    })
  }

  function handleDeleteOpenChange(open: boolean): void {
    if (!open) {
      setDeleteTarget(null)
      if (!confirmedRef.current) resyncNow()
      confirmedRef.current = false
    }
  }

  function handleTimeChange(libEvent: LibraryCalendarEvent): void {
    if (isCompleted(libEvent.id)) {
      resyncNow()
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
      }
      refreshAndResync()
    })
  }

  // The chip's complete circle (0.17.0) fires onEventToggleComplete with the
  // TOGGLED event (WeekCalendarView flips `completed` before calling back), so
  // `libEvent.completed` is the direction the user wants NOW: true = complete,
  // false = un-complete. Completing mirrors useActivityActions.handleComplete:
  // recurring tasks log an occurrence via recordCompletion, non-recurring
  // tasks/goals flip status via updateTask. Un-completing always goes through
  // updateTask({status:'pending'}) for BOTH kinds — there is no undo-completion
  // primitive (recordCompletion only marks a task done) and streak values are
  // derived on read from row statuses, so un-completing recomputes them. On
  // failure, resync to restore the chip's optimistic state (calendar pattern).
  function handleEventToggleComplete(libEvent: LibraryCalendarEvent): void {
    const isRecurring = events.find((e) => e.id === libEvent.id)?.recurrence != null
    const isCompleting = libEvent.completed === true
    startTransition(async () => {
      const result = isCompleting
        ? isRecurring
          ? await recordCompletion({ taskId: libEvent.id })
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
      }
      refreshAndResync()
    })
  }

  // The chip's lock affordance bubbles up as onEventToggleLock on WeekCalendarView
  // (view-level; distinct from the chip-level onToggleLock). Flip the row's PERSISTED
  // locked state (server truth — not the library's optimistic event, whose lock
  // handling is not relied on here) and persist it via updateTask with only
  // { id, locked }. Lock stays out of the complete-toggle and series-edit
  // routing predicates. On failure, resync to restore (calendar pattern).
  function handleToggleLock(libEvent: LibraryCalendarEvent): void {
    const currentlyLocked = events.find((e) => e.id === libEvent.id)?.locked ?? false
    startTransition(async () => {
      const result = await updateTask({ id: libEvent.id, locked: !currentlyLocked })
      if ('error' in result) {
        toast.error('Could not update lock — calendar restored')
      }
      refreshAndResync()
    })
  }

  function handleEventCreate(payload: Omit<LibraryCalendarEvent, 'id'>): void {
    startTransition(async () => {
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
        // Repeat count from the create popover (0.18.0): fans the weekly pattern
        // over N weeks (weeks × selected weekdays).
        recurrenceCount: payload.recurrenceCount,
      })
      if ('error' in result) toast.error('Could not create event — calendar restored')
      refreshAndResync()
    })
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-end gap-4">
        <SleepToggle enabled={!showFullDay} onToggle={(windowed) => setShowFullDay(!windowed)} />
      </div>

      <div data-testid="week-calendar">
        <WeekCalendarView
          defaultWeekStart={weekStart}
          resyncToken={resyncToken}
          events={events.map(toLibraryEvent)}
          onWeekChange={(week) => {
            const params = new URLSearchParams(window.location.search)
            params.set('week', week)
            router.replace(`?${params.toString()}`, { scroll: false })
          }}
          onEventMove={handleTimeChange}
          onEventResize={handleTimeChange}
          onEventDelete={(e) => setDeleteTarget(e)}
          onEventEdit={handleEventEdit}
          onEventCreate={handleEventCreate}
          onEventToggleComplete={handleEventToggleComplete}
          onEventToggleLock={handleToggleLock}
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
