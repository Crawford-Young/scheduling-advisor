'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  buildIso,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  TaskTimeFields,
  toTimeSlot,
} from '@/lib/ui'
import { createTask, updateTask } from '@/server/actions/tasks'

const REPEAT_MIN = 2
const REPEAT_MAX = 52

export interface TaskFormDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly taskId?: string
  readonly initialTitle?: string
  readonly initialStartAt?: string | null
  readonly initialEndAt?: string | null
  readonly initialRecurrence?: string | null
  readonly defaultDates?: readonly Date[]
  readonly defaultStartTime?: string
  readonly defaultEndTime?: string
}

export function TaskFormDialog({
  open,
  onOpenChange,
  taskId,
  initialTitle = '',
  initialStartAt,
  initialEndAt,
  initialRecurrence,
  defaultDates,
  defaultStartTime,
  defaultEndTime,
}: TaskFormDialogProps): React.JSX.Element {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [date, setDate] = useState<Date | undefined>(
    initialStartAt ? new Date(initialStartAt) : defaultDates?.[0],
  )
  const [startTime, setStartTime] = useState(
    initialStartAt ? toTimeSlot(initialStartAt) : (defaultStartTime ?? '09:00'),
  )
  const [endTime, setEndTime] = useState(
    initialEndAt ? toTimeSlot(initialEndAt) : (defaultEndTime ?? '10:00'),
  )
  const [recurrence, setRecurrence] = useState(initialRecurrence ?? 'none')
  const [recurrenceCount, setRecurrenceCount] = useState(REPEAT_MIN)
  const [isPending, startTransition] = useTransition()

  const isDateLocked = defaultDates !== undefined && defaultDates.length > 0

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    if (!date) return

    const startIso = buildIso(date, startTime)
    const endIso = buildIso(date, endTime)
    const recurrenceValue = recurrence === 'none' ? null : recurrence

    startTransition(async () => {
      if (taskId) {
        await updateTask({
          id: taskId,
          title,
          startAt: startIso,
          endAt: endIso,
          recurrence: recurrenceValue,
        })
      } else if (isDateLocked && defaultDates && defaultDates.length > 1) {
        for (const d of defaultDates) {
          await createTask({
            type: 'task',
            title,
            startAt: buildIso(d, startTime),
            endAt: buildIso(d, endTime),
            recurrence: recurrenceValue,
          })
        }
      } else {
        await createTask({
          type: 'task',
          title,
          startAt: startIso,
          endAt: endIso,
          recurrence: recurrenceValue,
          recurrenceCount: recurrence !== 'none' ? recurrenceCount : undefined,
        })
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{taskId ? 'Edit Task' : 'Add Task'}</DialogTitle>
        </DialogHeader>
        <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              required
              maxLength={200}
            />
          </div>

          {isDateLocked && defaultDates && (
            <div className="space-y-1">
              <Label>Date(s)</Label>
              <div className="flex flex-wrap gap-1.5">
                {defaultDates.map((d) => (
                  <span
                    key={d.toISOString()}
                    className="bg-accent/20 text-accent-foreground rounded px-2 py-0.5 text-xs"
                  >
                    {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                ))}
              </div>
            </div>
          )}

          <TaskTimeFields
            date={date}
            onDateChange={setDate}
            startTime={startTime}
            onStartTimeChange={setStartTime}
            endTime={endTime}
            onEndTimeChange={setEndTime}
            recurrence={recurrence}
            onRecurrenceChange={setRecurrence}
            recurrenceCount={recurrenceCount}
            onRecurrenceCountChange={setRecurrenceCount}
            showDate={!isDateLocked}
            showRecurrence={!isDateLocked}
            repeatMin={REPEAT_MIN}
            repeatMax={REPEAT_MAX}
          />
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" disabled={!title.trim() || !date || isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
