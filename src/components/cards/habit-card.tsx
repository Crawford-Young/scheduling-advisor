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
import { Flame, Pencil, Trash2 } from 'lucide-react'
import { updateTask, deleteTask } from '@/server/actions/tasks'
import { HabitFormDialog } from '@/components/habits/habit-form-dialog'

export const habitCardPropsSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  streak: z.number().int().min(0),
})

export type HabitCardProps = z.infer<typeof habitCardPropsSchema>

export function HabitCard({
  taskId,
  title,
  status: initialStatus,
  streak,
}: HabitCardProps): React.JSX.Element {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [, startTransition] = useTransition()

  function handleLog(): void {
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
                aria-label="Edit habit"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete habit"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Badge variant="outline" className="flex items-center gap-1">
                <Flame className="h-3 w-3 text-orange-500" aria-hidden />
                {streak} day streak
              </Badge>
            </div>
          </div>
        </CardHeader>
        {status !== 'completed' && (
          <CardContent>
            <Button variant="outline" size="sm" onClick={handleLog}>
              Log today
            </Button>
          </CardContent>
        )}
      </Card>

      <HabitFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        taskId={taskId}
        initialTitle={title}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this habit?</AlertDialogTitle>
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
