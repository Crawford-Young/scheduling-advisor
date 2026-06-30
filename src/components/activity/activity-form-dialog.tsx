'use client'
import * as React from 'react'
import { useState } from 'react'
import {
  buildIso,
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TaskTimeFields,
  Textarea,
  toTimeSlot,
  type CalendarEventColor,
} from '@/lib/ui'

// ─── Constants ────────────────────────────────────────────────────────────────

const REPEAT_MIN = 2
const REPEAT_MAX = 52

const COLOR_OPTIONS: readonly { readonly value: CalendarEventColor; readonly label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'blue', label: 'Blue' },
  { value: 'violet', label: 'Violet' },
  { value: 'green', label: 'Green' },
  { value: 'red', label: 'Red' },
  { value: 'amber', label: 'Amber' },
  { value: 'pink', label: 'Pink' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'teal', label: 'Teal' },
  { value: 'orange', label: 'Orange' },
  { value: 'rose', label: 'Rose' },
  { value: 'sky', label: 'Sky' },
  { value: 'fuchsia', label: 'Fuchsia' },
  { value: 'lime', label: 'Lime' },
] as const

// ─── Public types ─────────────────────────────────────────────────────────────

export type ActivityType = 'task' | 'goal'

export interface ActivitySocial {
  readonly activityType: 'solo' | 'group'
  readonly visibility: 'everyone' | 'friends' | 'busy' | 'only_me'
  readonly joinability?: 'open' | 'request' | 'closed'
  readonly maxParticipants?: number
}

export interface ActivityFormValues {
  readonly type: ActivityType
  readonly title: string
  readonly targetDate?: string | null
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly recurrence?: string | null
  readonly recurrenceCount?: number
  readonly color?: string | null
  readonly location?: string | null
  readonly description?: string | null
  readonly allDay?: boolean
  readonly social: ActivitySocial
}

export interface ActivityFormDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmit: (values: ActivityFormValues) => void | Promise<void>
  readonly initialType?: ActivityType
  readonly initialValues?: Partial<ActivityFormValues>
  readonly lockType?: boolean
  readonly isPending?: boolean
  readonly use24h?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialType = 'task',
  initialValues,
  lockType = false,
  isPending = false,
  use24h = false,
}: ActivityFormDialogProps): React.JSX.Element {
  // ── Type ────────────────────────────────────────────────────────────────────
  const [type, setType] = useState<ActivityType>(
    (initialValues?.type ?? initialType) as ActivityType,
  )

  // ── Common fields ───────────────────────────────────────────────────────────
  const [title, setTitle] = useState(initialValues?.title ?? '')

  // ── Task fields ─────────────────────────────────────────────────────────────
  const [date, setDate] = useState<Date | undefined>(
    initialValues?.startAt ? new Date(initialValues.startAt) : undefined,
  )
  const [startTime, setStartTime] = useState(
    initialValues?.startAt ? toTimeSlot(initialValues.startAt) : '09:00',
  )
  const [endTime, setEndTime] = useState(
    initialValues?.endAt ? toTimeSlot(initialValues.endAt) : '10:00',
  )
  const [recurrence, setRecurrence] = useState(initialValues?.recurrence ?? 'none')
  const [recurrenceCount, setRecurrenceCount] = useState(REPEAT_MIN)
  const [color, setColor] = useState<CalendarEventColor>(
    (initialValues?.color as CalendarEventColor | undefined) ?? 'default',
  )
  const [location, setLocation] = useState(initialValues?.location ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [allDay, setAllDay] = useState(initialValues?.allDay ?? false)

  // ── Goal fields ─────────────────────────────────────────────────────────────
  const [goalDate, setGoalDate] = useState<Date | undefined>(
    initialValues?.targetDate ? new Date(initialValues.targetDate + 'T12:00:00') : undefined,
  )

  // ── Derived ─────────────────────────────────────────────────────────────────
  const dialogTitle = `${initialValues ? 'Edit' : 'New'} ${type}`
  const isSaveDisabled =
    !title.trim() ||
    isPending ||
    (type === 'task' && !allDay && !date) ||
    (type === 'goal' && !goalDate)

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()

    // Social assembled from real state in B.4; use default until then
    const social: ActivitySocial = { activityType: 'solo', visibility: 'only_me' }

    if (type === 'goal') {
      if (!goalDate) return
      const pad = (n: number) => String(n).padStart(2, '0')
      const targetDate = `${goalDate.getFullYear()}-${pad(goalDate.getMonth() + 1)}-${pad(goalDate.getDate())}`
      onSubmit({
        type: 'goal',
        title,
        targetDate,
        location: location.trim() || null,
        description: description.trim() || null,
        social,
      })
      return
    }

    if (!allDay && !date) return

    const startIso = allDay ? null : buildIso(date!, startTime)
    const endIso = allDay ? null : buildIso(date!, endTime)
    const recurrenceValue = recurrence === 'none' ? null : recurrence

    onSubmit({
      type: 'task',
      title,
      startAt: startIso,
      endAt: endIso,
      recurrence: recurrenceValue,
      recurrenceCount: recurrence !== 'none' ? recurrenceCount : undefined,
      color: color !== 'default' ? color : null,
      location: location.trim() || null,
      description: description.trim() || null,
      allDay,
      social,
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>Create or edit an activity.</DialogDescription>
        </DialogHeader>

        {!lockType && (
          <div className="space-y-2">
            <Label>Type</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as ActivityType)}>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="task" id="afd-type-task" />
                  <Label htmlFor="afd-type-task">Task</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="goal" id="afd-type-goal" />
                  <Label htmlFor="afd-type-goal">Goal</Label>
                </div>
              </div>
            </RadioGroup>
          </div>
        )}

        <form id="activity-form" onSubmit={handleSubmit} className="space-y-4">
          {/* ── Title ── */}
          <div className="space-y-2">
            <Label htmlFor="afd-title">Title</Label>
            <Input
              id="afd-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Activity title"
              required
              maxLength={200}
            />
          </div>

          {/* ── Task fields ── */}
          {type === 'task' && (
            <>
              {/* All-day toggle */}
              <div className="flex items-center gap-2">
                <Switch id="afd-all-day" checked={allDay} onCheckedChange={setAllDay} />
                <Label htmlFor="afd-all-day">All day</Label>
              </div>

              {/* Time fields (hidden when all-day) */}
              {!allDay && (
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
                  showDate
                  showRecurrence
                  use24h={use24h}
                  repeatMin={REPEAT_MIN}
                  repeatMax={REPEAT_MAX}
                />
              )}

              {/* Color */}
              <div className="space-y-2">
                <Label>Color</Label>
                <Select value={color} onValueChange={(v) => setColor(v as CalendarEventColor)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label htmlFor="afd-task-location">Location</Label>
                <Input
                  id="afd-task-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location (optional)"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="afd-task-description">Description</Label>
                <Textarea
                  id="afd-task-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                />
              </div>
            </>
          )}

          {/* ── Goal fields ── */}
          {type === 'goal' && (
            <>
              {/* Target date */}
              <div className="space-y-2">
                <Label>Target date</Label>
                <DatePicker value={goalDate} onValueChange={setGoalDate} />
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label htmlFor="afd-goal-location">Location</Label>
                <Input
                  id="afd-goal-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location (optional)"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="afd-goal-description">Description</Label>
                <Textarea
                  id="afd-goal-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                />
              </div>
            </>
          )}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="activity-form" disabled={isSaveDisabled}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
