'use client'

import * as React from 'react'
import {
  ColorSwatchPicker,
  FormDialog,
  Input,
  Label,
  NumberInput,
  Textarea,
  type CalendarEventColor,
} from '@/lib/ui'

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * The full set of values emitted when an activity template is saved.
 *
 * Metadata-only (wave 4, A5): the per-day `schedule` builder was removed —
 * activities are reusable templates (duration bounds + a weekly session target),
 * and recurrence lives on events/series, not on the activity.
 */
export interface ActivityTemplateValues {
  readonly title: string
  readonly color?: string | null
  readonly description?: string | null
  readonly defaultLocation?: string | null
  readonly minDurationMin: number
  readonly maxDurationMin: number
  readonly weeklyTargetSessions: number
}

export interface ActivityTemplateDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmit: (values: ActivityTemplateValues) => void
  readonly initialValues?: Partial<ActivityTemplateValues>
  readonly isPending?: boolean
  /**
   * Accepted-and-ignored (A5): the metadata-only template has no time fields, so
   * there is nothing to format as 12/24h. Retained so the calendar / activities
   * call sites can keep threading the page preference uniformly.
   */
  readonly use24h?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_COLOR: CalendarEventColor = 'default'
const DEFAULT_MIN_DURATION = 15
const DEFAULT_MAX_DURATION = 60
const DEFAULT_WEEKLY_TARGET = 1
const MIN_WEEKLY_TARGET = 1
const MIN_DURATION_FLOOR = 1

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityTemplateDialog({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  isPending = false,
}: ActivityTemplateDialogProps): React.JSX.Element {
  const [title, setTitle] = React.useState(initialValues?.title ?? '')
  const [color, setColor] = React.useState<CalendarEventColor>(
    (initialValues?.color as CalendarEventColor | undefined) ?? DEFAULT_COLOR,
  )
  const [description, setDescription] = React.useState(initialValues?.description ?? '')
  const [defaultLocation, setDefaultLocation] = React.useState(initialValues?.defaultLocation ?? '')
  const [minDurationMin, setMinDurationMin] = React.useState(
    initialValues?.minDurationMin ?? DEFAULT_MIN_DURATION,
  )
  const [maxDurationMin, setMaxDurationMin] = React.useState(
    initialValues?.maxDurationMin ?? DEFAULT_MAX_DURATION,
  )
  const [weeklyTargetSessions, setWeeklyTargetSessions] = React.useState(
    initialValues?.weeklyTargetSessions ?? DEFAULT_WEEKLY_TARGET,
  )
  const [showErrors, setShowErrors] = React.useState(false)

  const titleId = React.useId()
  const descriptionId = React.useId()
  const locationId = React.useId()
  const minId = React.useId()
  const maxId = React.useId()
  const weeklyId = React.useId()

  // ── validation ────────────────────────────────────────────────────────────
  const titleError = title.trim() === '' ? 'Title is required.' : null
  const durationRangeError =
    minDurationMin > maxDurationMin
      ? 'Minimum duration must be less than or equal to maximum duration.'
      : null
  const weeklyTargetError =
    weeklyTargetSessions < MIN_WEEKLY_TARGET
      ? `Weekly target must be at least ${MIN_WEEKLY_TARGET}.`
      : null
  const hasErrors = titleError !== null || durationRangeError !== null || weeklyTargetError !== null

  // ── submit ────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    if (hasErrors) {
      setShowErrors(true)
      return
    }
    onSubmit({
      title: title.trim(),
      color: color === DEFAULT_COLOR ? null : color,
      description: description.trim() || null,
      defaultLocation: defaultLocation.trim() || null,
      minDurationMin,
      maxDurationMin,
      weeklyTargetSessions,
    })
  }

  const dialogTitle = initialValues ? 'Edit activity template' : 'New activity template'

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      title={dialogTitle}
      description="Define a reusable activity with duration bounds and a weekly session target."
      isPending={isPending}
      size="lg"
    >
      {/* Title */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          aria-label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Activity title"
        />
        {showErrors && titleError !== null && (
          <p role="alert" className="text-destructive text-xs">
            {titleError}
          </p>
        )}
      </div>

      {/* Color */}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm leading-none font-medium" aria-hidden="true">
          Color
        </p>
        <ColorSwatchPicker value={color} onChange={setColor} />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={descriptionId}>Description</Label>
        <Textarea
          id={descriptionId}
          aria-label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="min-h-16"
        />
      </div>

      {/* Default location */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={locationId}>Default location</Label>
        <Input
          id={locationId}
          aria-label="Default location"
          value={defaultLocation}
          onChange={(e) => setDefaultLocation(e.target.value)}
          placeholder="Location (optional)"
        />
      </div>

      {/* Duration bounds + weekly target */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={minId}>Min duration</Label>
          <NumberInput
            id={minId}
            aria-label="Min duration"
            value={minDurationMin}
            onChange={setMinDurationMin}
            min={MIN_DURATION_FLOOR}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={maxId}>Max duration</Label>
          <NumberInput
            id={maxId}
            aria-label="Max duration"
            value={maxDurationMin}
            onChange={setMaxDurationMin}
            min={MIN_DURATION_FLOOR}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={weeklyId}>Weekly target</Label>
          <NumberInput
            id={weeklyId}
            aria-label="Weekly target"
            value={weeklyTargetSessions}
            onChange={setWeeklyTargetSessions}
            min={MIN_WEEKLY_TARGET}
          />
        </div>
      </div>
      {showErrors && durationRangeError !== null && (
        <p role="alert" className="text-destructive text-xs">
          {durationRangeError}
        </p>
      )}
      {showErrors && weeklyTargetError !== null && (
        <p role="alert" className="text-destructive text-xs">
          {weeklyTargetError}
        </p>
      )}
    </FormDialog>
  )
}

ActivityTemplateDialog.displayName = 'ActivityTemplateDialog'
