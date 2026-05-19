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
  Button,
} from '@/lib/ui'
import { Pencil, Trash2 } from 'lucide-react'
import { deleteTask } from '@/server/actions/tasks'
import { TaskFormDialog } from './task-form-dialog'

interface TaskRowActionsProps {
  readonly taskId: string
  readonly title: string
  readonly startAt: string | null
  readonly endAt: string | null
  readonly recurrence: string | null
}

export function TaskRowActions({
  taskId,
  title,
  startAt,
  endAt,
  recurrence,
}: TaskRowActionsProps): React.JSX.Element {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [, startTransition] = useTransition()

  function handleConfirmDelete(): void {
    startTransition(async () => {
      await deleteTask({ id: taskId })
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Edit task"
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete task"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      <TaskFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        taskId={taskId}
        initialTitle={title}
        initialStartAt={startAt}
        initialEndAt={endAt}
        initialRecurrence={recurrence}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
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
