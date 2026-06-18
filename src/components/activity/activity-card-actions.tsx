'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ActivityFormDialog,
  type ActivityFormValues,
  type ActivitySocial,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@/lib/ui'
import { Pencil, Trash2 } from 'lucide-react'
import { updateTask, deleteTask } from '@/server/actions/tasks'
import { recordCompletion } from '@/server/actions/consistency'

const TARGET_DATE_TIME_SUFFIX = 'T12:00:00.000Z'

export type ActivityKind = 'task' | 'goal' | 'habit'

export interface ActivityCardActionsProps {
  readonly taskId: string
  readonly type: ActivityKind
  readonly title: string
  readonly status: 'pending' | 'in_progress' | 'completed'
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly recurrence?: string | null
  /** Date-only `YYYY-MM-DD` for goals. */
  readonly targetDate?: string | null
  readonly social: ActivitySocial
}

/** Goal target dates are edited as date-only but persisted as full ISO datetime. */
function toIsoTargetDate(dateOnly: string | null | undefined): string | null {
  return dateOnly ? new Date(`${dateOnly}${TARGET_DATE_TIME_SUFFIX}`).toISOString() : null
}

export function ActivityCardActions({
  taskId,
  type,
  title,
  status,
  startAt,
  endAt,
  recurrence,
  targetDate,
  social,
}: ActivityCardActionsProps): React.JSX.Element {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const isComplete = status === 'completed'
  const completeLabel = type === 'habit' ? 'Log today' : 'Mark complete'

  function handleComplete(): void {
    startTransition(async () => {
      if (type === 'habit') {
        await recordCompletion({ taskId, outcome: 'done' })
      } else {
        await updateTask({ id: taskId, status: 'completed' })
      }
      router.refresh()
    })
  }

  function handleEditSubmit(values: ActivityFormValues): void {
    startTransition(async () => {
      await updateTask({
        id: taskId,
        title: values.title,
        recurrence: values.recurrence ?? null,
        startAt: values.startAt ?? null,
        endAt: values.endAt ?? null,
        targetDate: toIsoTargetDate(values.targetDate),
      })
      setEditOpen(false)
      router.refresh()
    })
  }

  function handleConfirmDelete(): void {
    startTransition(async () => {
      await deleteTask({ id: taskId })
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {!isComplete && (
          <Button variant="outline" size="sm" onClick={handleComplete} disabled={isPending}>
            {completeLabel}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${type}`}
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${type}`}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      <ActivityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={handleEditSubmit}
        initialType={type}
        lockType
        isPending={isPending}
        initialValues={{
          type,
          title,
          startAt: startAt ?? undefined,
          endAt: endAt ?? undefined,
          recurrence: recurrence ?? undefined,
          targetDate: targetDate ?? undefined,
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
}
