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
import { updateTask, deleteTask } from '@/server/actions/tasks'
import { deleteSeries, updateSeries } from '@/server/actions/series-mutations'
import { recordCompletion } from '@/server/actions/consistency'

const TARGET_DATE_TIME_SUFFIX = 'T12:00:00.000Z'

// The subset of frequencies updateSeries can regenerate (its schema is a
// daily|weekly|monthly enum — 'yearly' never fans out, so it is not a series).
const SERIES_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const
type SeriesFrequency = (typeof SERIES_FREQUENCIES)[number]

function isSeriesFrequency(value: string | null | undefined): value is SeriesFrequency {
  return value != null && (SERIES_FREQUENCIES as readonly string[]).includes(value)
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
  /**
   * Recurrence-group id (wave 2.6 S4/S5). Non-null means the row belongs to a
   * fanned recurrence group — grouped edits route through `updateSeries` (the
   * single writer for every row of the group), which decides field-vs-pattern
   * server-side. Goals never carry a group id.
   */
  readonly recurrenceGroupId?: string | null
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
  recurrenceGroupId,
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

  // Series semantics v2 (wave 2.6 S5): a GROUPED row (recurrenceGroupId set)
  // always routes through updateSeries — the SERVER decides field-vs-pattern
  // (see series-mutations.ts), not the client. There is no more client-side
  // sameDaySet/daysChanged/recurrenceChanged/wasRecurring predicate. An
  // UNGROUPED row edited with a series frequency (becomingSeries) also routes
  // through updateSeries, which materializes a fresh group (or re-joins one).
  // Goals never materialize (the becomingSeries guard excludes type 'goal';
  // a grouped goal is not a real state). A non-series frequency (e.g.
  // 'yearly') maps recurrence to null in the updateSeries payload.
  function handleEditSubmit(values: ActivityFormValues): void {
    startTransition(async () => {
      const grouped = recurrenceGroupId != null
      const becomingSeries =
        values.type !== 'goal' && isSeriesFrequency(values.recurrence) && !grouped

      const result =
        grouped || becomingSeries
          ? await updateSeries({
              taskId,
              title: values.title,
              startAt: values.startAt ?? undefined,
              endAt: values.endAt ?? null,
              color: values.color ?? null,
              location: values.location ?? null,
              description: values.description ?? null,
              allDay: values.allDay,
              recurrence: isSeriesFrequency(values.recurrence) ? values.recurrence : null,
              recurrenceDays: values.recurrenceDays?.length ? values.recurrenceDays : undefined,
              recurrenceCount: values.recurrenceCount ?? null,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

  // Wave 2.6 S11: "Entire series" scope of the grouped delete dialog — removes
  // every occurrence row of the group plus its slot tombstones.
  function handleConfirmDeleteSeries(groupId: string): void {
    startTransition(async () => {
      const result = await deleteSeries({ groupId })
      if ('error' in result) {
        toast.error('Could not delete series')
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
            <AlertDialogDescription>
              {recurrenceGroupId != null
                ? 'Choose whether to remove just this occurrence or the entire series.'
                : 'This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {recurrenceGroupId != null ? (
              <>
                <AlertDialogAction
                  aria-label="Confirm delete this event only"
                  onClick={handleConfirmDelete}
                >
                  This event only
                </AlertDialogAction>
                <AlertDialogAction
                  aria-label="Confirm delete entire series"
                  onClick={() => recurrenceGroupId && handleConfirmDeleteSeries(recurrenceGroupId)}
                >
                  Entire series
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction aria-label="Confirm delete" onClick={handleConfirmDelete}>
                Confirm
              </AlertDialogAction>
            )}
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
