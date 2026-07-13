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
import { createTask, deleteTask, updateTask } from '@/server/actions/tasks'
import { deleteSeries, updateSeries } from '@/server/actions/series-mutations'
import { DAY_TOKENS } from '@/lib/series-generation'

// The browser's IANA zone, stamped on series-creating/pattern-editing payloads so
// server-side weekly-days generation lands occurrences on the correct LOCAL
// weekday/wall-clock (wave 2.6 S12).
function resolvedTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
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
  /**
   * Recurrence-group id (plain uuid column `recurrence_group_id`, wave 2.6 S4).
   * Non-null means the row belongs to a fanned recurrence group — grouped
   * edits/drags route through updateSeries (the single writer for every row
   * of the group) instead of the per-occurrence updateTask/rescheduleTask
   * paths. The server, not the client, decides field-vs-pattern for a
   * grouped edit.
   */
  readonly recurrenceGroupId: string | null
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

// The subset of frequencies updateSeries can regenerate (its schema is a
// daily|weekly|monthly enum — 'yearly' never fans out, so it is not a series).
const SERIES_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const
type SeriesFrequency = (typeof SERIES_FREQUENCIES)[number]

function isSeriesFrequency(value: string | null | undefined): value is SeriesFrequency {
  return value != null && (SERIES_FREQUENCIES as readonly string[]).includes(value)
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
  // S14: recurrence-group ids optimistically hidden while an "Entire series"
  // delete is in flight. Their chips are filtered out of the events prop the
  // instant the user confirms, so the whole group vanishes without waiting for
  // the deleteSeries round-trip + refresh.
  const [hiddenGroupIds, setHiddenGroupIds] = useState<ReadonlySet<string>>(() => new Set())
  const router = useRouter()
  const [, startTransition] = useTransition()
  // Tracks the router.refresh transition so the token bump waits until the fresh
  // events prop has actually arrived — bumping synchronously would re-seed from
  // the STALE props (the trap the old create-path machinery solved for).
  const [isRefreshing, startRefreshTransition] = useTransition()
  const refreshQueuedRef = React.useRef(false)
  const confirmedRef = React.useRef(false)
  // S14: groups whose optimistic overlay must be dropped ONCE the refresh
  // settles — clearing before the fresh (group-free) events prop arrives would
  // flash the chips back for the length of the round-trip.
  const clearHiddenAfterRefreshRef = React.useRef<Set<string>>(new Set())

  // When the refresh transition settles, isRefreshing drops to false — bump the
  // token so WeekCalendarView re-seeds from the freshly-arrived events prop, and
  // drop any optimistic hidden-group overlay now that the deleted rows are gone
  // from the fresh events prop (so the chips never flash back mid-refresh).
  React.useEffect(() => {
    if (!isRefreshing && refreshQueuedRef.current) {
      refreshQueuedRef.current = false
      setResyncToken((t) => t + 1)
      if (clearHiddenAfterRefreshRef.current.size > 0) {
        const toClear = clearHiddenAfterRefreshRef.current
        clearHiddenAfterRefreshRef.current = new Set()
        setHiddenGroupIds((prev) => {
          const next = new Set(prev)
          for (const id of toClear) next.delete(id)
          return next
        })
      }
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

  // The library chip popover owns the edit form; onEventEdit delivers the
  // FINISHED edit to persist (already applied optimistically to the library's
  // internal state). Mirror handleTimeChange's error handling: toast on error,
  // refreshAndResync on every persist path.
  // Series semantics v2 (wave 2.6 S4): a GROUPED row (recurrenceGroupId set)
  // always routes through updateSeries — the SERVER decides field-vs-pattern
  // (see series-mutations.ts), not the client. There is no more client-side
  // sameDaySet/daysChanged/recurrenceChanged/wasRecurring predicate. An
  // UNGROUPED row edited with a series frequency (becomingSeries) also routes
  // through updateSeries, which materializes a fresh group (or re-joins one).
  // Goals never materialize (the becomingSeries guard excludes type 'goal';
  // a grouped goal is not a real state). A non-series frequency (e.g.
  // 'yearly') maps recurrence to null in the updateSeries payload.
  function handleEventEdit(libEvent: LibraryCalendarEvent): void {
    startTransition(async () => {
      const original = events.find((e) => e.id === libEvent.id)
      const freq = libEvent.recurrenceFrequency
      const emittedDays = libEvent.recurrenceDays ?? []
      const grouped = original?.recurrenceGroupId != null
      const becomingSeries = original?.type !== 'goal' && isSeriesFrequency(freq) && !grouped

      const result =
        grouped || becomingSeries
          ? await updateSeries({
              taskId: libEvent.id,
              title: libEvent.title,
              startAt: new Date(libEvent.start).toISOString(),
              endAt: new Date(libEvent.end).toISOString(),
              color: libEvent.color ?? null,
              location: libEvent.location ?? null,
              description: libEvent.description ?? null,
              allDay: libEvent.allDay ?? false,
              recurrence: isSeriesFrequency(freq) ? freq : null,
              recurrenceDays: emittedDays.length > 0 ? emittedDays : undefined,
              timeZone: resolvedTimeZone(),
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

  // Wave 2.6 S11: "Entire series" scope of the grouped delete dialog — removes
  // every occurrence row of the group plus its slot tombstones.
  // S14 (redo): optimistic — hide the whole group's chips the instant the user
  // confirms, then reconcile:
  //   • success → refresh, and clear the overlay ONLY after the fresh events
  //     prop (now group-free) arrives, so the chips never flash back;
  //   • error   → reveal the group again (its rows still exist) + toast; the
  //     DEFERRED token bump inside refreshAndResync's settle effect is what
  //     actually restores the chips visually — an accepted small delay on the
  //     (rare) error path only.
  //
  // WeekCalendarView seeds its internal state once at mount and re-derives
  // from the `events` prop ONLY on a resyncToken identity change — it never
  // reads `events` directly during render (dist index.mjs ~5619-5657). So the
  // hiddenGroupIds filter on `visibleEvents` below is invisible to the chip
  // grid until a token bump. Calling ONLY refreshAndResync() here (which defers
  // its bump until the deleteSeries round-trip + router.refresh() settle) left
  // every OTHER occurrence of the group rendering from stale internal state
  // for the whole round-trip — only the clicked chip vanished via the
  // library's own single-chip delete optimism. Fix: bump resyncNow()
  // SYNCHRONOUSLY here, in the same tick as setHiddenGroupIds/setDeleteTarget
  // — React batches all three, so the re-seed effect that resyncToken triggers
  // reads the already-filtered `visibleEvents` on the very next render.
  //
  // ACCEPTED trade-off: this synchronous re-seed replaces the library's ENTIRE
  // internal localEvents wholesale (it is not a scoped removal), so any OTHER
  // in-flight optimistic edit on the grid at this exact moment would
  // transiently revert to its last-committed prop value until ITS OWN
  // refreshAndResync bump re-applies it. The library's only re-seed guard is
  // an active-drag (dragMode idle) check. Rare (two concurrent mutations in
  // the same tick) and self-healing (the reverted edit's own pending refresh
  // repairs it) — not engineered around further here.
  function handleConfirmDeleteSeries(groupId: string): void {
    confirmedRef.current = true
    setDeleteTarget(null)
    setHiddenGroupIds((prev) => new Set(prev).add(groupId))
    resyncNow()
    startTransition(async () => {
      const result = await deleteSeries({ groupId })
      if ('error' in result) {
        setHiddenGroupIds((prev) => {
          const next = new Set(prev)
          next.delete(groupId)
          return next
        })
        toast.error('Could not delete series')
        refreshAndResync()
        return
      }
      clearHiddenAfterRefreshRef.current.add(groupId)
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

  // Ungrouped rows keep the single-row rescheduleTask path. Grouped rows route
  // through updateSeries: a same-weekday drag is a time-of-day-only rewrite;
  // a cross-weekday drag on a row with a persisted weekday set also rewrites
  // that set (old weekday out, new weekday in); a cross-weekday drag with NO
  // day set (daily/monthly interval series) has no set to rewrite, so it also
  // stays time-of-day-only (a day-set rewrite has no meaning without a set).
  function handleTimeChange(libEvent: LibraryCalendarEvent): void {
    startTransition(async () => {
      const original = events.find((e) => e.id === libEvent.id)
      const startAt = new Date(libEvent.start).toISOString()
      const endAt = new Date(libEvent.end).toISOString()

      let result:
        | Awaited<ReturnType<typeof rescheduleTask>>
        | Awaited<ReturnType<typeof updateSeries>>
      if (original === undefined || original.recurrenceGroupId === null) {
        result = await rescheduleTask({
          taskId: libEvent.id,
          newStartAt: startAt,
          newEndAt: endAt,
        })
      } else {
        // LOCAL getDay (matches the grid's local rendering, per the 0.19.0
        // local-wall-clock invariant): an evening chip's UTC day is the next day,
        // so getUTCDay would swap the wrong token.
        const oldDow = new Date(original.start).getDay()
        const newDow = new Date(libEvent.start).getDay()
        const persistedDays = original.recurrenceDays ?? []
        result =
          oldDow !== newDow && persistedDays.length > 0
            ? await updateSeries({
                taskId: libEvent.id,
                startAt,
                endAt,
                recurrence: 'weekly',
                recurrenceDays: Array.from(
                  new Set([
                    ...persistedDays.filter((token) => token !== DAY_TOKENS[oldDow]),
                    DAY_TOKENS[newDow],
                  ]),
                ),
                timeZone: resolvedTimeZone(),
              })
            : await updateSeries({
                taskId: libEvent.id,
                startAt,
                endAt,
                timeZone: resolvedTimeZone(),
              })
      }

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

  // Wave 2.6 S11: a delete target that belongs to a recurrence group offers a
  // 3-way scope choice ("This event only" / "Entire series"); an ungrouped
  // target keeps the plain 2-way confirm. Looked up from the events prop (the
  // library's delete-target event carries no recurrenceGroupId of its own).
  const deleteTargetGroupId = deleteTarget
    ? (events.find((e) => e.id === deleteTarget.id)?.recurrenceGroupId ?? null)
    : null

  // S14: drop every occurrence of an optimistically-deleted series before the
  // events reach the library, so the whole group's chips disappear at once.
  const visibleEvents = React.useMemo(
    () =>
      events.filter(
        (e) => e.recurrenceGroupId === null || !hiddenGroupIds.has(e.recurrenceGroupId),
      ),
    [events, hiddenGroupIds],
  )

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
        timeZone: resolvedTimeZone(),
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
          events={visibleEvents.map(toLibraryEvent)}
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
          recurrenceEditMode="server"
        />
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={handleDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTargetGroupId !== null
                ? `Delete "${deleteTarget?.title ?? ''}"? Choose whether to remove just this occurrence or the entire series.`
                : `Delete "${deleteTarget?.title ?? ''}"? This removes the task and its history.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {deleteTargetGroupId !== null ? (
              <>
                <AlertDialogAction
                  onClick={() => deleteTarget && handleConfirmDelete(deleteTarget)}
                >
                  This event only
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={() =>
                    deleteTargetGroupId && handleConfirmDeleteSeries(deleteTargetGroupId)
                  }
                >
                  Entire series
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={() => deleteTarget && handleConfirmDelete(deleteTarget)}>
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
