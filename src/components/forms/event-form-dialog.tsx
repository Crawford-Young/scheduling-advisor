'use client'

import * as React from 'react'
import {
  ColorSwatchPicker,
  DatePicker,
  FormDialog,
  Input,
  Label,
  Switch,
  TaskTimeFields,
  Textarea,
  buildIso,
  toTimeSlot,
  type CalendarEventColor,
} from '@/lib/ui'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface EventFormValues {
  readonly title: string
  /**
   * ISO instant, built via `buildIso` (local wall-clock). All-day events emit
   * real instants (00:00–23:59 of the picked local day). May be `null` only for
   * legacy rows persisted before all-day gained a date — editing such a row
   * seeds no date and requires re-picking one before Save enables.
   */
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly allDay?: boolean
  readonly color?: string | null
  readonly location?: string | null
  readonly description?: string | null
}

export interface EventFormDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmit: (values: EventFormValues) => void
  readonly initialValues?: Partial<EventFormValues>
  readonly isPending?: boolean
  /** Display event times as 24-hour instead of 12-hour with AM/PM. */
  readonly use24h?: boolean
  /**
   * Dialog intent for the heading. When omitted, falls back to inferring from
   * `initialValues` (present → "Edit event"), preserved for back-compat.
   */
  readonly mode?: 'create' | 'edit'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_START_TIME = '09:00'
const DEFAULT_END_TIME = '10:00'
const ALL_DAY_START_TIME = '00:00'
const ALL_DAY_END_TIME = '23:59'
const DEFAULT_COLOR: CalendarEventColor = 'default'
const MAX_TITLE_LENGTH = 200

// ─── Component ────────────────────────────────────────────────────────────────

export function EventFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  isPending = false,
  use24h = false,
  mode,
}: EventFormDialogProps): React.JSX.Element {
  const [title, setTitle] = React.useState(initialValues?.title ?? '')

  const [taskDate, setTaskDate] = React.useState<Date | undefined>(() => {
    if (initialValues?.startAt) {
      const d = new Date(initialValues.startAt)
      // Anchor on the instant's LOCAL calendar day (matching `toTimeSlot`'s local
      // read below and `buildIso`'s local day-anchor on submit) — not its UTC day.
      return new Date(d.getFullYear(), d.getMonth(), d.getDate())
    }
    return undefined
  })
  const [startTime, setStartTime] = React.useState<string>(() =>
    initialValues?.startAt ? toTimeSlot(initialValues.startAt) : DEFAULT_START_TIME,
  )
  const [endTime, setEndTime] = React.useState<string>(() =>
    initialValues?.endAt ? toTimeSlot(initialValues.endAt) : DEFAULT_END_TIME,
  )
  const [color, setColor] = React.useState<CalendarEventColor>(
    (initialValues?.color as CalendarEventColor | undefined) ?? DEFAULT_COLOR,
  )
  const [location, setLocation] = React.useState(initialValues?.location ?? '')
  const [description, setDescription] = React.useState(initialValues?.description ?? '')
  const [allDay, setAllDay] = React.useState(initialValues?.allDay ?? false)

  const dialogTitle = mode
    ? mode === 'edit'
      ? 'Edit event'
      : 'New event'
    : initialValues
      ? 'Edit event'
      : 'New event'

  const formId = React.useId()
  const titleId = React.useId()
  const dateFieldId = React.useId()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault()

    // A date is required in both modes — all-day events map to real 00:00–23:59
    // instants of the picked local day so the library can place them.
    if (!taskDate) return

    onSubmit({
      title,
      startAt: buildIso(taskDate, allDay ? ALL_DAY_START_TIME : startTime),
      endAt: buildIso(taskDate, allDay ? ALL_DAY_END_TIME : endTime),
      allDay,
      color: color === DEFAULT_COLOR ? null : color,
      location: location.trim() || null,
      description: description.trim() || null,
    })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      title={dialogTitle}
      description="Create or edit an event."
      isPending={isPending}
      submitDisabled={title.trim() === '' || !taskDate}
    >
      {/* Title */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          aria-label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title"
          maxLength={MAX_TITLE_LENGTH}
        />
      </div>

      {/* All-day */}
      <div className="flex items-center gap-2">
        <Switch id={`${formId}-all-day`} checked={allDay} onCheckedChange={setAllDay} />
        <Label htmlFor={`${formId}-all-day`}>All day</Label>
      </div>

      {allDay ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={dateFieldId}>Date</Label>
          <DatePicker value={taskDate} onValueChange={setTaskDate} placeholder="Pick a date" />
        </div>
      ) : (
        <TaskTimeFields
          date={taskDate}
          onDateChange={setTaskDate}
          startTime={startTime}
          onStartTimeChange={setStartTime}
          endTime={endTime}
          onEndTimeChange={setEndTime}
          showDate
          use24h={use24h}
        />
      )}

      {/* Color */}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm leading-none font-medium" aria-hidden="true">
          Color
        </p>
        <ColorSwatchPicker value={color} onChange={setColor} />
      </div>

      {/* Location */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-location`}>Location</Label>
        <Input
          id={`${formId}-location`}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location (optional)"
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-description`}>Description</Label>
        <Textarea
          id={`${formId}-description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="min-h-16"
        />
      </div>
    </FormDialog>
  )
}

EventFormDialog.displayName = 'EventFormDialog'
