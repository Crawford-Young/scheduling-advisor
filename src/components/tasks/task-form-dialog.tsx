'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  NumberInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/lib/ui'
import { createTask, updateTask } from '@/server/actions/tasks'

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const

const TIME_SLOTS: Array<{ value: string; label: string }> = Array.from({ length: 48 }, (_, i) => {
  const totalMins = i * 30
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const period = h < 12 ? 'AM' : 'PM'
  const displayH = h % 12 || 12
  const label = `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`
  return { value, label }
})

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

function toTimeSlot(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function buildIso(date: Date, time: string): string {
  const [h, m] = time.split(':').map(Number)
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m, 0),
  ).toISOString()
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
  const [recurrenceCount, setRecurrenceCount] = useState(2)
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

          {!isDateLocked && (
            <div className="space-y-2">
              <Label>Date</Label>
              <DatePicker value={date} onValueChange={setDate} />
            </div>
          )}

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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start time</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Start" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>End time</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger>
                  <SelectValue placeholder="End" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isDateLocked && (
            <>
              <div className="space-y-2">
                <Label>Recurrence</Label>
                <Select value={recurrence} onValueChange={setRecurrence}>
                  <SelectTrigger>
                    <SelectValue placeholder="Does not repeat" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {recurrence !== 'none' && (
                <div className="space-y-2">
                  <Label htmlFor="task-repeat-count">Repeat</Label>
                  <div className="flex items-center gap-2">
                    <NumberInput
                      aria-label="repeat count"
                      value={recurrenceCount}
                      onChange={setRecurrenceCount}
                      min={2}
                      max={52}
                    />
                    <span className="text-muted-foreground text-sm">times</span>
                  </div>
                </div>
              )}
            </>
          )}
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
