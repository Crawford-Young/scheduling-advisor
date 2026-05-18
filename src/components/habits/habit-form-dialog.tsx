'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@/lib/ui'
import { createTask, updateTask } from '@/server/actions/tasks'

export interface HabitFormDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly taskId?: string
  readonly initialTitle?: string
}

export function HabitFormDialog({
  open,
  onOpenChange,
  taskId,
  initialTitle = '',
}: HabitFormDialogProps): React.JSX.Element {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    startTransition(async () => {
      if (taskId) {
        await updateTask({ id: taskId, title })
      } else {
        await createTask({ type: 'habit', title })
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{taskId ? 'Edit Habit' : 'Add Habit'}</DialogTitle>
        </DialogHeader>
        <form id="habit-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="habit-title">Title</Label>
            <Input
              id="habit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Habit title"
              required
              maxLength={200}
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="habit-form" disabled={!title.trim() || isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
