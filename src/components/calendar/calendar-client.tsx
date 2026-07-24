'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  WeekCalendarView,
  SleepToggle,
  Button,
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
  type CreateActivityOption,
  type CreateRequest,
  type DayWindow,
  type EventCreateSubmitPayload,
} from '@/lib/ui'
import {
  EventFormDialog,
  type EventFormValues,
  type EventFormRecurrence,
} from '@/components/forms/event-form-dialog'
import {
  ActivityTemplateDialog,
  type ActivityTemplateValues,
} from '@/components/forms/activity-template-dialog'
import { createEvent, updateEvent, deleteEvent } from '@/server/actions/events'
import { createActivity, updateActivity } from '@/server/actions/activities'
import { createSeries } from '@/server/actions/series'

const ONE_HOUR_MS = 60 * 60 * 1000
const MINUTES_PER_HOUR = 60
const MS_PER_MINUTE = 60 * 1000
// A local `YYYY-MM-DD` `until` date's END OF DAY, inclusive — the series stops
// generating occurrences after this local instant.
const UNTIL_END_HOUR = 23
const UNTIL_END_MINUTE = 59
const UNTIL_END_SECOND = 59
const UNTIL_END_MS = 999
// `EventFormRecurrence.until` is `'YYYY-MM-DD'` (1-based month); `Date`'s
// month constructor arg is 0-based.
const UNTIL_MONTH_OFFSET = 1

// The header "New event" button's default slot: today, the next full hour
// (local wall-clock), 1h duration. Real UTC instants, per the local-wall-clock
// invariant — only the local READING of "now" determines the boundary.
function nextFullHourRange(): { readonly startAt: string; readonly endAt: string } {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  const end = new Date(start.getTime() + ONE_HOUR_MS)
  return { startAt: start.toISOString(), endAt: end.toISOString() }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AppCalendarEvent {
  readonly id: string
  readonly title: string
  readonly start: string
  readonly end: string
  readonly color?: string | null
  readonly allDay?: boolean
  readonly location?: string | null
  readonly description?: string | null
  readonly status: 'pending' | 'completed'
  /**
   * Persisted move/resize gate (`events.locked`). Seeds the library chip's lock
   * state; the lock toggle flips this and persists it via updateEvent.
   */
  readonly locked?: boolean
  /**
   * Id of the backing activity (`events.activity_id`), or null for a standalone
   * event. Non-null drives the chip popover's "Edit activity" action.
   */
  readonly activityId: string | null
}

/**
 * A user activity template threaded from the calendar page. Feeds two surfaces:
 * the create-popover's activity picker (needs id/title/color/min duration) AND
 * the in-calendar "Edit activity" flow (needs the full template to seed
 * `ActivityTemplateDialog`).
 */
interface CalendarActivity {
  readonly id: string
  readonly title: string
  readonly color: string | null
  readonly description: string | null
  readonly defaultLocation: string | null
  readonly minDurationMin: number
  readonly maxDurationMin: number
  readonly weeklyTargetSessions: number
}

// ─── Mapping (app → library) ──────────────────────────────────────────────────
// Prefer the event's persisted color. A falsy persisted color maps to the
// library's literal 'default' variant (its chip does `ev.color ?? 'default'`) —
// the same fallback the create-form emits when no swatch is chosen.

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
    // Completion contract: the chip renders a one-click complete circle (opt-in
    // via `completable`); `completed` drives the filled state and toggling it
    // fires onEventToggleComplete.
    completed: e.status === 'completed',
    completable: true,
    // Lock state: drives the chip's lock affordance; the library gates
    // move/resize on locked rows client-side.
    locked: e.locked ?? undefined,
    // Non-null enables the popover's "Edit activity" action.
    activityId: e.activityId ?? undefined,
  }
}

// Seeds the app-owned EventFormDialog from the library event the popover's Edit
// action delivered (start/end are already real UTC instants).
function toEventFormValues(e: LibraryCalendarEvent): EventFormValues {
  return {
    title: e.title,
    startAt: e.start,
    endAt: e.end,
    allDay: e.allDay ?? false,
    color: e.color ?? null,
    location: e.location ?? null,
    description: e.description ?? null,
  }
}

// ─── Series submit mapping (A7) ────────────────────────────────────────────
// Maps a recurrence-bearing EventFormValues submit onto createSeries' input
// shape. Rule fields are copied straight from the already fully-formed
// EventFormRecurrence (never rebuilt) — startMinutes/durationMin/anchorStartAt
// derive from the submitted startAt/endAt via LOCAL Date getters, per the
// local-wall-clock invariant.

interface SeriesSubmitInput {
  readonly title: string
  readonly description: string | null
  readonly location: string | null
  readonly color: string | null
  readonly activityId: null
  readonly freq: EventFormRecurrence['freq']
  readonly weekdays?: readonly number[]
  readonly dayOfMonth?: number
  readonly nthOrdinal?: number
  readonly nthWeekday?: number
  readonly month?: number
  readonly startMinutes: number
  readonly durationMin: number
  readonly timeZone: string
  readonly anchorStartAt: string
  readonly until: Date | null
}

// Local minutes-since-midnight reading of a real UTC instant.
function localMinutesSinceMidnight(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * MINUTES_PER_HOUR + d.getMinutes()
}

// Local end-of-day `Date` for a `'YYYY-MM-DD'` string (never `new
// Date(dateStr)`, which parses UTC midnight — local-wall-clock invariant).
function localEndOfDay(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(
    year!,
    month! - UNTIL_MONTH_OFFSET,
    day!,
    UNTIL_END_HOUR,
    UNTIL_END_MINUTE,
    UNTIL_END_SECOND,
    UNTIL_END_MS,
  )
}

// `values.startAt`/`endAt` are always real ISO instants here — EventFormDialog
// guards `if (!taskDate) return` before ever building a recurrence, so both
// are populated whenever `values.recurrence` is present.
function toSeriesSubmitInput(values: EventFormValues): SeriesSubmitInput {
  const recurrence = values.recurrence!
  const startAt = values.startAt!
  const endAt = values.endAt!
  return {
    title: values.title,
    description: values.description ?? null,
    location: values.location ?? null,
    color: values.color ?? null,
    activityId: null,
    freq: recurrence.freq,
    weekdays: recurrence.weekdays,
    dayOfMonth: recurrence.dayOfMonth,
    nthOrdinal: recurrence.nthOrdinal,
    nthWeekday: recurrence.nthWeekday,
    month: recurrence.month,
    startMinutes: localMinutesSinceMidnight(startAt),
    durationMin: (new Date(endAt).getTime() - new Date(startAt).getTime()) / MS_PER_MINUTE,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    anchorStartAt: startAt,
    until: recurrence.until ? localEndOfDay(recurrence.until) : null,
  }
}

// ─── CalendarClient ───────────────────────────────────────────────────────────

interface CalendarClientProps {
  readonly weekStart: string
  readonly events: readonly AppCalendarEvent[]
  /**
   * The user's activity templates — feed the drag-create popover's picker and
   * the in-calendar "Edit activity" flow.
   */
  readonly activities: readonly CalendarActivity[]
  readonly wakeHour: number
  readonly sleepHour: number
  /** Per-day awake windows in fractional hours, Sun-first (7 entries). */
  readonly dayWindows: readonly DayWindow[]
  /** Render event times as 24-hour instead of 12-hour with AM/PM. */
  readonly use24h: boolean
}

export function CalendarClient({
  weekStart,
  events,
  activities,
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
  // The delete-confirm dialog and the event-edit dialog are app-owned; the
  // create popover + activity picker live in the library. null = no dialog open.
  const [deleteTarget, setDeleteTarget] = useState<LibraryCalendarEvent | null>(null)
  const [editTarget, setEditTarget] = useState<LibraryCalendarEvent | null>(null)
  // Header "New activity" button: opens an EMPTY ActivityTemplateDialog in
  // create mode. No follow-up event popover (QA Round 3 amendment) — the
  // activity's generated pattern events reveal on resync.
  const [newActivityOpen, setNewActivityOpen] = useState(false)
  // Header "New event" button: non-null opens a standalone EventFormDialog in
  // create mode, seeded with today's next full hour + 1h duration.
  const [newEventDefaults, setNewEventDefaults] = useState<{
    readonly startAt: string
    readonly endAt: string
  } | null>(null)
  // The activity whose "Edit activity" chip action opened the in-calendar
  // ActivityTemplateDialog. null = closed. (Fix a — no /activities navigation.)
  const [editActivity, setEditActivity] = useState<CalendarActivity | null>(null)
  // Controlled create-popover reopen (0.25.0): a non-null value re-opens the
  // library's create popover at `slot` with `activityId` preselected (and any
  // `draft` fields overriding the option seed). Drives two flows — "new
  // activity → reopen" (after createActivity) and "duplicate from event". The
  // library opens on the non-null transition; a dismiss-without-submit fires
  // onCreateRequestDismiss, submit flows through onEventCreate.
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(null)
  // resyncToken re-seeds WeekCalendarView from the events prop WITHOUT
  // remounting: the library applies move/resize/edit/delete optimistically and
  // never re-derives from props on its own, so router.refresh() alone cannot
  // restore the view. Bumping the token forces a re-seed while preserving
  // in-calendar week navigation. confirmedRef keeps a confirmed delete's
  // onOpenChange(false) close from firing a second immediate bump.
  const [resyncToken, setResyncToken] = useState(0)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Tracks the router.refresh transition so the token bump waits until the
  // fresh events prop has arrived — bumping synchronously would re-seed from
  // the STALE props.
  const [isRefreshing, startRefreshTransition] = useTransition()
  const refreshQueuedRef = React.useRef(false)
  const confirmedRef = React.useRef(false)

  // When the refresh transition settles, bump the token so WeekCalendarView
  // re-seeds from the freshly-arrived events prop.
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

  // Immediate token bump, no refresh round-trip — the delete-cancel path, where
  // the props already hold server truth and only the library's own optimistic
  // delete needs reverting.
  function resyncNow(): void {
    setResyncToken((t) => t + 1)
  }

  const createActivityOptions: readonly CreateActivityOption[] = activities.map((a) => ({
    id: a.id,
    label: a.title,
    color: a.color ? (a.color as CreateActivityOption['color']) : undefined,
    // The picker's default draw length is the activity's shortest session.
    defaultDurationMin: a.minDurationMin,
  }))

  // The library popover's Edit action fires onEventEdit; the app opens its own
  // EventFormDialog seeded from the event, and this persists the finished edit.
  function handleEditSubmit(target: LibraryCalendarEvent, values: EventFormValues): void {
    setEditTarget(null)
    startTransition(async () => {
      const result = await updateEvent({
        id: target.id,
        title: values.title,
        startAt: values.startAt ?? null,
        endAt: values.endAt ?? null,
        allDay: values.allDay ?? false,
        color: values.color ?? null,
        location: values.location ?? null,
        description: values.description ?? null,
      })
      if ('error' in result) {
        toast.error('Could not save event — calendar restored')
      }
      refreshAndResync()
    })
  }

  function handleEditOpenChange(open: boolean): void {
    if (!open) setEditTarget(null)
  }

  function handleConfirmDelete(target: LibraryCalendarEvent): void {
    confirmedRef.current = true
    setDeleteTarget(null)
    startTransition(async () => {
      const result = await deleteEvent({ id: target.id })
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

  // Move and resize both land here: persist the new bounds via updateEvent.
  // Events are independent originals — no grouped guard, no sibling lookup.
  function handleTimeChange(libEvent: LibraryCalendarEvent): void {
    startTransition(async () => {
      const result = await updateEvent({
        id: libEvent.id,
        startAt: new Date(libEvent.start).toISOString(),
        endAt: new Date(libEvent.end).toISOString(),
      })
      if ('error' in result) {
        toast.error('Could not reschedule — calendar restored')
      }
      refreshAndResync()
    })
  }

  // The chip's complete circle fires onEventToggleComplete with the TOGGLED
  // event (the library flips `completed` before calling back), so
  // `libEvent.completed` is the direction the user wants NOW.
  function handleEventToggleComplete(libEvent: LibraryCalendarEvent): void {
    const isCompleting = libEvent.completed === true
    startTransition(async () => {
      const result = await updateEvent({
        id: libEvent.id,
        status: isCompleting ? 'completed' : 'pending',
      })
      if ('error' in result) {
        toast.error(isCompleting ? 'Could not mark complete' : 'Could not mark incomplete')
      }
      refreshAndResync()
    })
  }

  // The chip's lock affordance bubbles up as onEventToggleLock. Flip the row's
  // PERSISTED locked state (server truth, not the library's optimistic event)
  // and persist it via updateEvent with only { id, locked }.
  function handleToggleLock(libEvent: LibraryCalendarEvent): void {
    const currentlyLocked = events.find((e) => e.id === libEvent.id)?.locked ?? false
    startTransition(async () => {
      const result = await updateEvent({ id: libEvent.id, locked: !currentlyLocked })
      if ('error' in result) {
        toast.error('Could not update lock — calendar restored')
      }
      refreshAndResync()
    })
  }

  // The library fans a multi-day drag for DISPLAY only; the submit payload
  // carries a single slot with no span, so exactly one original event is
  // persisted (a transient fan-out collapse on resync is accepted).
  function handleEventCreate(payload: EventCreateSubmitPayload): void {
    startTransition(async () => {
      const result = await createEvent({
        title: payload.title,
        startAt: new Date(payload.start).toISOString(),
        endAt: new Date(payload.end).toISOString(),
        allDay: payload.allDay ?? false,
        color: payload.color ?? null,
        location: payload.location ?? null,
        description: payload.description ?? null,
        activityId: payload.activityId ?? null,
      })
      if ('error' in result) {
        toast.error('Could not create event — calendar restored')
      }
      refreshAndResync()
    })
  }

  // Header "New activity" button submit: create the activity (its schedule
  // generates its own events server-side). NO follow-up event popover — the
  // generated pattern events reveal on resync (QA Round 3 amendment: explicit
  // buttons replaced the drag-create→new-activity entry point).
  function handleNewActivitySubmit(values: ActivityTemplateValues): void {
    setNewActivityOpen(false)
    startTransition(async () => {
      const result = await createActivity({
        title: values.title,
        color: values.color ?? null,
        description: values.description ?? null,
        defaultLocation: values.defaultLocation ?? null,
        minDurationMin: values.minDurationMin,
        maxDurationMin: values.maxDurationMin,
        weeklyTargetSessions: values.weeklyTargetSessions,
        // Metadata-only (A5): no schedule/timeZone stamp.
      })
      if ('error' in result) {
        toast.error('Could not create activity — calendar restored')
      }
      refreshAndResync()
    })
  }

  // Header "New event" button submit: a standalone event (activityId null —
  // button-created events are never attached to an activity by design;
  // attach-to-activity stays a drag-create/duplicate affordance). Present
  // `values.recurrence` routes to createSeries instead of createEvent —
  // absent/null recurrence keeps the one-off path byte-unchanged.
  function handleNewEventSubmit(values: EventFormValues): void {
    setNewEventDefaults(null)
    if (values.recurrence) {
      startTransition(async () => {
        const result = await createSeries(toSeriesSubmitInput(values))
        if ('error' in result) {
          toast.error('Could not create series — calendar restored')
        }
        refreshAndResync()
      })
      return
    }
    startTransition(async () => {
      const result = await createEvent({
        title: values.title,
        startAt: values.startAt ?? null,
        endAt: values.endAt ?? null,
        allDay: values.allDay ?? false,
        color: values.color ?? null,
        location: values.location ?? null,
        description: values.description ?? null,
        activityId: null,
      })
      if ('error' in result) {
        toast.error('Could not create event — calendar restored')
      }
      refreshAndResync()
    })
  }

  function handleNewEventOpenChange(open: boolean): void {
    if (!open) setNewEventDefaults(null)
  }

  // A createRequest-opened popover dismissed WITHOUT submit: the activity
  // already exists (and generated its own schedule events), so clear the
  // request and resync to reveal them — same semantics as the old guided-cancel
  // path. The submit path resyncs via onEventCreate instead, so this fires only
  // on a genuine dismiss (no double-refresh).
  function handleCreateRequestDismiss(): void {
    setCreateRequest(null)
    refreshAndResync()
  }

  // The popover's "Duplicate" action fires with the source event; reopen the
  // create popover at the same bounds, preselecting its activity and seeding
  // its fields via `draft`. Pure state (no server write) — persistence happens
  // only if the user submits, through onEventCreate.
  function handleEventDuplicate(libEvent: LibraryCalendarEvent): void {
    setCreateRequest({
      slot: { start: libEvent.start, end: libEvent.end },
      activityId: libEvent.activityId ?? null,
      draft: {
        title: libEvent.title,
        color: libEvent.color,
        location: libEvent.location,
        description: libEvent.description,
      },
    })
  }

  // The popover's "Edit activity" action fires with the chip's activityId; open
  // the in-calendar ActivityTemplateDialog seeded from that activity (fix a —
  // no /activities navigation). Guarded on a match in the threaded activities.
  function handleEventEditActivity(libEvent: LibraryCalendarEvent): void {
    const activity = activities.find((a) => a.id === libEvent.activityId)
    if (activity !== undefined) setEditActivity(activity)
  }

  // Edit-activity submitted: persist via updateActivity (a pattern change resets
  // the activity's generation high-water mark and regenerates server-side).
  function handleActivityEditSubmit(activityId: string, values: ActivityTemplateValues): void {
    setEditActivity(null)
    startTransition(async () => {
      const result = await updateActivity({
        id: activityId,
        title: values.title,
        color: values.color ?? null,
        description: values.description ?? null,
        defaultLocation: values.defaultLocation ?? null,
        minDurationMin: values.minDurationMin,
        maxDurationMin: values.maxDurationMin,
        weeklyTargetSessions: values.weeklyTargetSessions,
        // Metadata-only (A5): no schedule/timeZone stamp.
      })
      if ('error' in result) {
        toast.error('Could not save activity — calendar restored')
      }
      refreshAndResync()
    })
  }

  function handleActivityEditOpenChange(open: boolean): void {
    if (!open) setEditActivity(null)
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-end gap-4">
        <div className="flex items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => setNewActivityOpen(true)}>
            New activity
          </Button>
          <Button type="button" onClick={() => setNewEventDefaults(nextFullHourRange())}>
            New event
          </Button>
        </div>
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
          onEventEdit={(e) => setEditTarget(e)}
          onEventEditActivity={handleEventEditActivity}
          onEventDuplicate={handleEventDuplicate}
          onEventCreate={handleEventCreate}
          onEventToggleComplete={handleEventToggleComplete}
          onEventToggleLock={handleToggleLock}
          createActivityOptions={createActivityOptions}
          createRequest={createRequest}
          onCreateRequestDismiss={handleCreateRequestDismiss}
          hourStart={hourStart}
          hourCount={hourCount}
          sleepEnabled={sleepEnabled}
          sleepStart={sleepStart}
          sleepEnd={sleepEnd}
          dayWindows={dayWindows}
          use24h={use24h}
        />
      </div>

      {editTarget !== null && (
        <EventFormDialog
          open
          mode="edit"
          onOpenChange={handleEditOpenChange}
          initialValues={toEventFormValues(editTarget)}
          onSubmit={(values) => handleEditSubmit(editTarget, values)}
          isPending={isPending}
          use24h={use24h}
        />
      )}

      {newActivityOpen && (
        <ActivityTemplateDialog
          open
          onOpenChange={setNewActivityOpen}
          onSubmit={handleNewActivitySubmit}
          isPending={isPending}
          use24h={use24h}
        />
      )}

      {newEventDefaults !== null && (
        <EventFormDialog
          open
          mode="create"
          onOpenChange={handleNewEventOpenChange}
          initialValues={{
            startAt: newEventDefaults.startAt,
            endAt: newEventDefaults.endAt,
            allDay: false,
          }}
          onSubmit={handleNewEventSubmit}
          isPending={isPending}
          use24h={use24h}
        />
      )}

      {editActivity !== null && (
        <ActivityTemplateDialog
          open
          onOpenChange={handleActivityEditOpenChange}
          onSubmit={(values) => handleActivityEditSubmit(editActivity.id, values)}
          isPending={isPending}
          use24h={use24h}
          initialValues={{
            title: editActivity.title,
            color: editActivity.color ?? undefined,
            description: editActivity.description ?? undefined,
            defaultLocation: editActivity.defaultLocation ?? undefined,
            minDurationMin: editActivity.minDurationMin,
            maxDurationMin: editActivity.maxDurationMin,
            weeklyTargetSessions: editActivity.weeklyTargetSessions,
          }}
        />
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={handleDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event</AlertDialogTitle>
            <AlertDialogDescription>
              {`Delete "${deleteTarget?.title ?? ''}"? This removes the event.`}
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
