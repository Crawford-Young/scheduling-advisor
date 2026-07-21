'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ActivityTemplateDialog,
  EventFormDialog,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  toast,
  type ActivityScheduleSlot,
  type ActivityTemplateValues,
  type EventFormValues,
} from '@/lib/ui'
import { updateActivity, deleteActivity } from '@/server/actions/activities'
import { updateEvent, deleteEvent } from '@/server/actions/events'

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
  readonly schedule: readonly ActivityScheduleSlot[]
  readonly timeZone: string | null
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
        schedule: values.schedule,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

  // initialValues re-derives from `activity` every render, so a close→reopen (or
  // deep-link auto-open) always seeds the dialog from the CURRENT row.
  const dialogs = (
    <>
      <ActivityTemplateDialog
        open={editOpen}
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
          schedule: activity.schedule,
        }}
      />
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
      <EventFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={handleEditSubmit}
        isPending={isPending}
        use24h={use24h}
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
