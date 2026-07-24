'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  toast,
} from '@/lib/ui'
import {
  EventFormDialog,
  type EventFormRecurrence,
  type EventFormValues,
} from '@/components/forms/event-form-dialog'
import {
  ActivityTemplateDialog,
  type ActivityTemplateValues,
} from '@/components/forms/activity-template-dialog'
import type { SeriesFreq } from '@/lib/schemas/series'
import { updateActivity, deleteActivity } from '@/server/actions/activities'
import { updateEvent, deleteEvent } from '@/server/actions/events'
import { updateSeries, deleteSeries } from '@/server/actions/series'

/** Child-event semantics stated verbatim in the activity delete confirm dialog. */
const DELETE_ACTIVITY_TITLE = 'Delete this activity?'
const DELETE_ACTIVITY_DESCRIPTION = 'Deletes future pending events; past events are kept'
const DELETE_EVENT_TITLE = 'Delete this event?'
const DELETE_EVENT_DESCRIPTION = 'This cannot be undone.'

type EventStatus = 'pending' | 'completed'

interface ConfirmDeleteDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly description: string
  readonly onConfirm: () => void
}

/** Shared confirm dialog for both activity and event deletes. */
function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: ConfirmDeleteDialogProps): React.JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction aria-label="Confirm delete" onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── Activity template rows ────────────────────────────────────────────────────

/** Serialized activity template row consumed by the edit/delete controls. */
export interface ActivityActionsRow {
  readonly id: string
  readonly title: string
  readonly color: string | null
  readonly description: string | null
  readonly defaultLocation: string | null
  readonly minDurationMin: number
  readonly maxDurationMin: number
  readonly weeklyTargetSessions: number
}

export interface UseActivityActionsArgs {
  readonly activity: ActivityActionsRow
  /** Display schedule times as 24-hour in the template dialog. */
  readonly use24h?: boolean
  /** Auto-open the edit dialog on mount — the `?edit=<activityId>` deep-link path. */
  readonly initialEditOpen?: boolean
}

export interface UseActivityActionsResult {
  readonly isPending: boolean
  readonly openEdit: () => void
  readonly openDelete: () => void
  readonly dialogs: React.ReactNode
}

/** Edit (ActivityTemplateDialog → updateActivity) + delete (deleteActivity) wiring for an activity row. */
export function useActivityActions({
  activity,
  use24h,
  initialEditOpen,
}: UseActivityActionsArgs): UseActivityActionsResult {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(initialEditOpen ?? false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleEditSubmit(values: ActivityTemplateValues): void {
    startTransition(async () => {
      const result = await updateActivity({
        id: activity.id,
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
        toast.error('Could not save activity')
        return
      }
      setEditOpen(false)
      router.refresh()
    })
  }

  function handleConfirmDelete(): void {
    startTransition(async () => {
      const result = await deleteActivity({ id: activity.id })
      if ('error' in result) {
        toast.error('Could not delete activity')
        return
      }
      router.refresh()
    })
  }

  // Conditional-mount the edit dialog: a fresh mount per open re-seeds its
  // internal draft state from the CURRENT row, so a cancelled edit never leaks
  // an abandoned draft into the next open.
  const dialogs = (
    <>
      {editOpen && (
        <ActivityTemplateDialog
          open
          onOpenChange={setEditOpen}
          onSubmit={handleEditSubmit}
          isPending={isPending}
          use24h={use24h}
          initialValues={{
            title: activity.title,
            color: activity.color ?? undefined,
            description: activity.description ?? undefined,
            defaultLocation: activity.defaultLocation ?? undefined,
            minDurationMin: activity.minDurationMin,
            maxDurationMin: activity.maxDurationMin,
            weeklyTargetSessions: activity.weeklyTargetSessions,
          }}
        />
      )}
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={DELETE_ACTIVITY_TITLE}
        description={DELETE_ACTIVITY_DESCRIPTION}
        onConfirm={handleConfirmDelete}
      />
    </>
  )

  return {
    isPending,
    openEdit: () => setEditOpen(true),
    openDelete: () => setDeleteOpen(true),
    dialogs,
  }
}

// ── One-off event rows ────────────────────────────────────────────────────────

/** Serialized standalone-event row consumed by the one-off section controls. */
export interface EventActionsRow {
  readonly id: string
  readonly title: string
  readonly startAt: string | null
  readonly endAt: string | null
  readonly allDay: boolean
  readonly color: string | null
  readonly location: string | null
  readonly description: string | null
  readonly status: EventStatus
}

export interface UseEventActionsArgs {
  readonly event: EventActionsRow
  /** Display event times as 24-hour in the event dialog. */
  readonly use24h?: boolean
}

export interface UseEventActionsResult {
  readonly isPending: boolean
  readonly isComplete: boolean
  readonly completeLabel: string
  readonly handleComplete: () => void
  readonly openEdit: () => void
  readonly openDelete: () => void
  readonly dialogs: React.ReactNode
}

/** Complete-toggle + edit (EventFormDialog → updateEvent) + delete (deleteEvent) wiring for a one-off event. */
export function useEventActions({ event, use24h }: UseEventActionsArgs): UseEventActionsResult {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const isComplete = event.status === 'completed'
  const completeLabel = isComplete ? 'Mark pending' : 'Mark complete'

  function handleComplete(): void {
    startTransition(async () => {
      const nextStatus: EventStatus = isComplete ? 'pending' : 'completed'
      const result = await updateEvent({ id: event.id, status: nextStatus })
      if ('error' in result) {
        toast.error('Could not update event')
        return
      }
      router.refresh()
    })
  }

  function handleEditSubmit(values: EventFormValues): void {
    startTransition(async () => {
      const result = await updateEvent({
        id: event.id,
        title: values.title,
        startAt: values.startAt ?? null,
        endAt: values.endAt ?? null,
        allDay: values.allDay ?? false,
        color: values.color ?? null,
        location: values.location ?? null,
        description: values.description ?? null,
      })
      if ('error' in result) {
        toast.error('Could not save event')
        return
      }
      setEditOpen(false)
      router.refresh()
    })
  }

  function handleConfirmDelete(): void {
    startTransition(async () => {
      const result = await deleteEvent({ id: event.id })
      if ('error' in result) {
        toast.error('Could not delete event')
        return
      }
      router.refresh()
    })
  }

  const dialogs = (
    <>
      {editOpen && (
        <EventFormDialog
          open
          mode="edit"
          onOpenChange={setEditOpen}
          onSubmit={handleEditSubmit}
          isPending={isPending}
          use24h={use24h}
          showRecurrence={false}
          initialValues={{
            title: event.title,
            startAt: event.startAt ?? undefined,
            endAt: event.endAt ?? undefined,
            allDay: event.allDay,
            color: event.color ?? undefined,
            location: event.location ?? undefined,
            description: event.description ?? undefined,
          }}
        />
      )}
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={DELETE_EVENT_TITLE}
        description={DELETE_EVENT_DESCRIPTION}
        onConfirm={handleConfirmDelete}
      />
    </>
  )

  return {
    isPending,
    isComplete,
    completeLabel,
    handleComplete,
    openEdit: () => setEditOpen(true),
    openDelete: () => setDeleteOpen(true),
    dialogs,
  }
}

// ── Series rows ───────────────────────────────────────────────────────────────

const DELETE_SERIES_TITLE = 'Delete this series?'
const DELETE_SERIES_DESCRIPTION = 'Past and completed events are always kept.'
const SERIES_REQUIRES_RECURRENCE_MESSAGE = 'A series must repeat — choose a repeat option'

const MINUTES_PER_HOUR = 60
const MS_PER_MINUTE = 60_000
/** Convert a 0-based `Date#getMonth()`-style index to a 1-based calendar month. */
const MONTH_OFFSET = 1
// A fixed LEAP year used as the anchor-date reference for monthly-day-of-month
// and yearly rules — guarantees a Feb 29 rule (and any 1-31 dayOfMonth value,
// combined with the January special-case below) never silently rolls into the
// next month/year via JS `Date` auto-normalization.
const ANCHOR_REFERENCE_YEAR = 2024
// January always has 31 days — a safe reference month for monthly
// day-of-month anchors, which range 1-31 with no associated month.
const SAFE_DAY_ANCHOR_MONTH_INDEX = 0
const END_OF_DAY_HOUR = 23
const END_OF_DAY_MINUTE = 59
const END_OF_DAY_SECOND = 59
const END_OF_DAY_MS = 999

/** Serialized series row consumed by the edit/delete controls. */
export interface SeriesActionsRow {
  readonly id: string
  readonly title: string
  readonly description: string | null
  readonly location: string | null
  readonly color: string | null
  readonly freq: SeriesFreq
  readonly weekdays: readonly number[] | null
  readonly dayOfMonth: number | null
  readonly nthOrdinal: number | null
  readonly nthWeekday: number | null
  readonly month: number | null
  readonly startMinutes: number
  readonly durationMin: number
  /** ISO instant, or null for no end date. */
  readonly until: string | null
}

export interface UseSeriesActionsArgs {
  readonly series: SeriesActionsRow
  /** Display series times as 24-hour in the edit dialog. */
  readonly use24h?: boolean
}

export interface UseSeriesActionsResult {
  readonly isPending: boolean
  readonly openEdit: () => void
  readonly openDelete: () => void
  readonly dialogs: React.ReactNode
}

/** Local `YYYY-MM-DD` string from a `Date`'s local getters (never `toISOString`). */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + MONTH_OFFSET).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Parses a `YYYY-MM-DD` string into a local end-of-day `Date` (`until` is inclusive). */
function untilStringToDate(until: string | null | undefined): Date | null {
  if (!until) return null
  const [year, month, day] = until.split('-').map(Number)
  return new Date(
    year!,
    month! - MONTH_OFFSET,
    day!,
    END_OF_DAY_HOUR,
    END_OF_DAY_MINUTE,
    END_OF_DAY_SECOND,
    END_OF_DAY_MS,
  )
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

/**
 * Builds a representative `startAt`/`endAt` pair for seeding the (byte-shared)
 * `EventFormDialog` from a series rule. The dialog derives monthly-day-mode
 * `dayOfMonth` and yearly `month`/`dayOfMonth` from this anchor's LOCAL
 * calendar day at submit time (it has no separate state for them) — so the
 * anchor's day/month must reproduce the series' rule exactly, and on a fixed
 * reference year/month that can never JS-`Date`-rollover a valid 1-31 day
 * into the next month (weekly/daily/monthly-nth rules don't depend on the
 * anchor's day, so "now" is used there for a natural-feeling default).
 */
function buildSeriesAnchor(series: SeriesActionsRow): {
  readonly startAt: string
  readonly endAt: string
} {
  const hours = Math.floor(series.startMinutes / MINUTES_PER_HOUR)
  const minutes = series.startMinutes % MINUTES_PER_HOUR
  const now = new Date()

  let year = now.getFullYear()
  let month = now.getMonth()
  let day = now.getDate()

  if (series.freq === 'yearly') {
    year = ANCHOR_REFERENCE_YEAR
    month = (series.month ?? MONTH_OFFSET) - MONTH_OFFSET
    day = Math.min(series.dayOfMonth ?? 1, daysInMonth(year, month))
  } else if (series.freq === 'monthly' && series.nthOrdinal === null) {
    year = ANCHOR_REFERENCE_YEAR
    month = SAFE_DAY_ANCHOR_MONTH_INDEX
    day = Math.min(series.dayOfMonth ?? 1, daysInMonth(year, month))
  }

  const start = new Date(year, month, day, hours, minutes)
  const end = new Date(start.getTime() + series.durationMin * MS_PER_MINUTE)
  return { startAt: start.toISOString(), endAt: end.toISOString() }
}

/** Maps a series row to the dialog's `EventFormRecurrence` seed shape. */
function buildSeriesRecurrence(series: SeriesActionsRow): EventFormRecurrence {
  const isMonthlyDayMode = series.freq === 'monthly' && series.nthOrdinal === null
  const isMonthlyNthMode = series.freq === 'monthly' && series.nthOrdinal !== null
  return {
    freq: series.freq,
    weekdays: series.freq === 'weekly' ? (series.weekdays ?? undefined) : undefined,
    dayOfMonth:
      series.freq === 'yearly' || isMonthlyDayMode ? (series.dayOfMonth ?? undefined) : undefined,
    nthOrdinal: isMonthlyNthMode ? (series.nthOrdinal ?? undefined) : undefined,
    nthWeekday: isMonthlyNthMode ? (series.nthWeekday ?? undefined) : undefined,
    month: series.freq === 'yearly' ? (series.month ?? undefined) : undefined,
    until: series.until ? toLocalDateString(new Date(series.until)) : null,
  }
}

interface ConfirmDeleteSeriesDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onKeep: () => void
  readonly onDeleteFuture: () => void
}

/** Series delete confirm — offers both `deleteSeries` modes side by side. */
function ConfirmDeleteSeriesDialog({
  open,
  onOpenChange,
  onKeep,
  onDeleteFuture,
}: ConfirmDeleteSeriesDialogProps): React.JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{DELETE_SERIES_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{DELETE_SERIES_DESCRIPTION}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onKeep}>Keep events</AlertDialogAction>
          <AlertDialogAction onClick={onDeleteFuture}>Delete future events too</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Edit (EventFormDialog → updateSeries) + delete (deleteSeries, both modes) wiring for a series row. */
export function useSeriesActions({ series, use24h }: UseSeriesActionsArgs): UseSeriesActionsResult {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleEditSubmit(values: EventFormValues): void {
    const recurrence = values.recurrence
    if (!recurrence) {
      toast.error(SERIES_REQUIRES_RECURRENCE_MESSAGE)
      return
    }
    // The dialog blocks submit without a date, so `startAt` is always set here.
    const start = new Date(values.startAt!)
    const end = values.endAt ? new Date(values.endAt) : start
    const startMinutes = start.getHours() * MINUTES_PER_HOUR + start.getMinutes()
    const durationMin = Math.round((end.getTime() - start.getTime()) / MS_PER_MINUTE)

    startTransition(async () => {
      const result = await updateSeries({
        id: series.id,
        title: values.title,
        description: values.description ?? null,
        location: values.location ?? null,
        color: values.color ?? null,
        freq: recurrence.freq,
        weekdays: recurrence.weekdays,
        dayOfMonth: recurrence.dayOfMonth,
        nthOrdinal: recurrence.nthOrdinal,
        nthWeekday: recurrence.nthWeekday,
        month: recurrence.month,
        startMinutes,
        durationMin,
        until: untilStringToDate(recurrence.until),
      })
      if ('error' in result) {
        toast.error('Could not save series')
        return
      }
      setEditOpen(false)
      router.refresh()
    })
  }

  function handleConfirmDelete(mode: 'keep' | 'deleteFuture'): void {
    startTransition(async () => {
      const result = await deleteSeries({ id: series.id, mode })
      if ('error' in result) {
        toast.error('Could not delete series')
        return
      }
      router.refresh()
    })
  }

  const dialogs = (
    <>
      {editOpen && (
        <EventFormDialog
          open
          mode="edit"
          onOpenChange={setEditOpen}
          onSubmit={handleEditSubmit}
          isPending={isPending}
          use24h={use24h}
          initialValues={{
            title: series.title,
            ...buildSeriesAnchor(series),
            allDay: false,
            color: series.color ?? undefined,
            location: series.location ?? undefined,
            description: series.description ?? undefined,
            recurrence: buildSeriesRecurrence(series),
          }}
        />
      )}
      <ConfirmDeleteSeriesDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onKeep={() => handleConfirmDelete('keep')}
        onDeleteFuture={() => handleConfirmDelete('deleteFuture')}
      />
    </>
  )

  return {
    isPending,
    openEdit: () => setEditOpen(true),
    openDelete: () => setDeleteOpen(true),
    dialogs,
  }
}
