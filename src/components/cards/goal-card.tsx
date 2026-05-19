'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
} from '@/lib/ui'
import { Pencil, Trash2 } from 'lucide-react'
import { updateTask, deleteTask } from '@/server/actions/tasks'
import { GoalFormDialog } from '@/components/goals/goal-form-dialog'

export const goalCardPropsSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  targetDate: z.string().nullable().optional(),
})

export type GoalCardProps = z.infer<typeof goalCardPropsSchema>

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
}

export function GoalCard({
  taskId,
  title,
  status: initialStatus,
  targetDate,
}: GoalCardProps): React.JSX.Element {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [, startTransition] = useTransition()

  function handleComplete(): void {
    setStatus('completed')
    startTransition(async () => {
      await updateTask({ id: taskId, status: 'completed' })
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{title}</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit goal"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete goal"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Badge>{STATUS_LABELS[status]}</Badge>
            </div>
          </div>
          {targetDate && <p className="text-muted-foreground text-xs">Target: {targetDate}</p>}
        </CardHeader>
        {status !== 'completed' && (
          <CardContent>
            <Button variant="outline" size="sm" onClick={handleComplete}>
              Mark complete
            </Button>
          </CardContent>
        )}
      </Card>

      <GoalFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        taskId={taskId}
        initialTitle={title}
        initialTargetDate={targetDate}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
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
