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
  DatePicker,
} from '@/lib/ui'
import { createTask, updateTask } from '@/server/actions/tasks'

export interface GoalFormDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly taskId?: string
  readonly initialTitle?: string
  readonly initialTargetDate?: string | null
}

export function GoalFormDialog({
  open,
  onOpenChange,
  taskId,
  initialTitle = '',
  initialTargetDate,
}: GoalFormDialogProps): React.JSX.Element {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [targetDate, setTargetDate] = useState<Date | undefined>(
    initialTargetDate ? new Date(initialTargetDate + 'T12:00:00') : undefined,
  )
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    const dateIso = targetDate
      ? new Date(
          Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 12),
        ).toISOString()
      : null
    startTransition(async () => {
      if (taskId) {
        await updateTask({ id: taskId, title, targetDate: dateIso })
      } else {
        await createTask({ type: 'goal', title, targetDate: dateIso })
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{taskId ? 'Edit Goal' : 'Add Goal'}</DialogTitle>
        </DialogHeader>
        <form id="goal-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Goal title"
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label>Target date (optional)</Label>
            <DatePicker value={targetDate} onValueChange={setTargetDate} />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="goal-form" disabled={!title.trim() || isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
