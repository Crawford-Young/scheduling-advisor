'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ActivityFormDialog,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  toast,
  type ActivityFormValues,
  type ActivitySocial,
  type DayOfWeek,
} from '@/lib/ui'
import { updateTask, updateTaskSeries, deleteTask } from '@/server/actions/tasks'
import { recordCompletion } from '@/server/actions/consistency'

const TARGET_DATE_TIME_SUFFIX = 'T12:00:00.000Z'

// The subset of frequencies updateTaskSeries can regenerate (its schema is a
// daily|weekly|monthly enum). Since 0.18.0 the dialog has a weekday picker
// (ActivityFormValues.recurrenceDays), so a series edit can change frequency,
// repeat count, and/or the weekday set.
const SERIES_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const
type SeriesFrequency = (typeof SERIES_FREQUENCIES)[number]

function isSeriesFrequency(value: string | null | undefined): value is SeriesFrequency {
  return value != null && (SERIES_FREQUENCIES as readonly string[]).includes(value)
}

// Order-insensitive equality for two weekday-token sets. The dialog seeds the
// picker from the row's recurrenceDays and re-emits the selection on EVERY save,
// so routing must compare by membership (not presence) — a reordered but
// unchanged set is NOT an edit and must keep the row-shaped updateTask path.
function sameDaySet(a: readonly DayOfWeek[], b: readonly DayOfWeek[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((day) => setB.has(day))
}

export type ActivityKind = 'task' | 'goal'

export interface ActivityCardActionsProps {
  readonly taskId: string
  readonly type: ActivityKind
  readonly title: string
  readonly status: 'pending' | 'in_progress' | 'completed'
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly recurrence?: string | null
  /** Repeat count of the recurrence group (persisted since S3); seeds the dialog. */
  readonly recurrenceCount?: number | null
  /** Persisted weekday set of the recurrence group; seeds the dialog's Days picker. */
  readonly recurrenceDays?: readonly DayOfWeek[] | null
  /** Date-only `YYYY-MM-DD` for goals. */
  readonly targetDate?: string | null
  readonly color?: string | null
  readonly location?: string | null
  readonly description?: string | null
  readonly allDay?: boolean
  readonly social: ActivitySocial
  /** Display task times as 24-hour instead of 12-hour with AM/PM. */
  readonly use24h?: boolean
}

/** Goal target dates are edited as date-only but persisted as full ISO datetime. */
function toIsoTargetDate(dateOnly: string | null | undefined): string | null {
  return dateOnly ? new Date(`${dateOnly}${TARGET_DATE_TIME_SUFFIX}`).toISOString() : null
}

export interface UseActivityActionsResult {
  readonly isPending: boolean
  readonly isComplete: boolean
  readonly completeLabel: string
  readonly handleComplete: () => void
  readonly openEdit: () => void
  readonly openDelete: () => void
  readonly dialogs: React.ReactNode
}

/** Shared complete/edit/delete wiring for activity cards and the data table (A6). */
export function useActivityActions({
  taskId,
  type,
  title,
  status,
  startAt,
  endAt,
  recurrence,
  recurrenceCount,
  recurrenceDays,
  targetDate,
  color,
  location,
  description,
  allDay,
  social,
  use24h,
}: ActivityCardActionsProps): UseActivityActionsResult {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const isComplete = status === 'completed'
  const completeLabel = recurrence ? 'Log today' : 'Mark complete'

  function handleComplete(): void {
    startTransition(async () => {
      const result =
        recurrence != null
          ? await recordCompletion({ taskId })
          : await updateTask({ id: taskId, status: 'completed' })
      if ('error' in result) {
        toast.error(recurrence != null ? 'Could not log completion' : 'Could not mark complete')
        return
      }
      router.refresh()
    })
  }

  function handleEditSubmit(values: ActivityFormValues): void {
    startTransition(async () => {
      // Series-shaped vs row-shaped routing. When a task already part of a
      // recurrence group changes its frequency or repeat count, regenerate the
      // group's future pending rows via updateTaskSeries. Everything else
      // (goals, row-shaped-only task edits) keeps updateTask.
      //
      // Mixed edit (a pattern change AND a row-shaped change like title/time in
      // the same save): the series change owns the save — updateTaskSeries
      // regenerates from the anchor row's persisted fields, and the co-changed
      // row-shaped fields are NOT separately written here (interim until S9).
      //
      // S10: setting a series frequency on a NON-recurring task ALSO routes to
      // updateTaskSeries, which materializes the series (updates the anchor in
      // place and fans out future occurrences). Clearing recurrence on an
      // already-recurring task (frequency drops to a non-series value) stays on
      // updateTask — that direction is unchanged.
      // S9: the seeded weekday picker re-emits recurrenceDays on every save, so
      // days presence is unconditional — route on order-insensitive SET EQUALITY
      // against the row's persisted set (mirrors calendar-client's predicate).
      const wasRecurring = recurrence != null
      const recurrenceChanged = (values.recurrence ?? null) !== (recurrence ?? null)
      const countChanged = (values.recurrenceCount ?? null) !== (recurrenceCount ?? null)
      const daysChanged = !sameDaySet(values.recurrenceDays ?? [], recurrenceDays ?? [])
      const routeToSeries =
        values.type !== 'goal' &&
        isSeriesFrequency(values.recurrence) &&
        (!wasRecurring || recurrenceChanged || countChanged || daysChanged)

      const result = routeToSeries
        ? await updateTaskSeries({
            taskId,
            recurrence: values.recurrence,
            recurrenceCount: values.recurrenceCount,
            recurrenceDays:
              values.recurrenceDays && values.recurrenceDays.length > 0
                ? values.recurrenceDays
                : undefined,
          })
        : await updateTask(
            values.type === 'goal'
              ? {
                  id: taskId,
                  title: values.title,
                  targetDate: toIsoTargetDate(values.targetDate),
                  location: values.location ?? null,
                  description: values.description ?? null,
                }
              : {
                  id: taskId,
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
      setEditOpen(false)
      router.refresh()
    })
  }

  function handleConfirmDelete(): void {
    startTransition(async () => {
      const result = await deleteTask({ id: taskId })
      if ('error' in result) {
        toast.error('Could not delete activity')
        return
      }
      router.refresh()
    })
  }

  const dialogs = (
    <>
      <ActivityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={handleEditSubmit}
        initialType={type}
        lockType
        isPending={isPending}
        use24h={use24h}
        initialValues={{
          type,
          title,
          startAt: startAt ?? undefined,
          endAt: endAt ?? undefined,
          recurrence: recurrence ?? undefined,
          recurrenceCount: recurrenceCount ?? undefined,
          recurrenceDays: recurrenceDays ?? undefined,
          targetDate: targetDate ?? undefined,
          color: color ?? undefined,
          location: location ?? undefined,
          description: description ?? undefined,
          allDay,
          social,
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {type}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction aria-label="Confirm delete" onClick={handleConfirmDelete}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
