'use client'

import * as React from 'react'
import {
  ColorSwatchPicker,
  DatePicker,
  FormDialog,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TaskTimeFields,
  Textarea,
  buildIso,
  toTimeSlot,
  type CalendarEventColor,
} from '@/lib/ui'
import type { SeriesFreq } from '@/lib/schemas/series'

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Native repeat configuration emitted alongside the event. Field naming mirrors
 * the series schema (`src/lib/schemas/series.ts`) so a later task (A7) can route
 * it straight to `createSeries`. Absent/null recurrence = a one-off event.
 */
export interface EventFormRecurrence {
  readonly freq: SeriesFreq
  /** Weekly only: selected weekdays, 0–6 Sun-first, non-empty. */
  readonly weekdays?: readonly number[]
  /** Monthly day-of-month mode (1–31) and yearly day-within-month. */
  readonly dayOfMonth?: number
  /** Monthly nth-weekday mode: 1–4, or -1 for "last". */
  readonly nthOrdinal?: number
  /** Monthly nth-weekday mode: weekday 0–6 Sun-first. */
  readonly nthWeekday?: number
  /** Yearly: month 1–12. */
  readonly month?: number
  /** Local date (YYYY-MM-DD) the series ends on, inclusive. Absent/null = no end. */
  readonly until?: string | null
}

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
  /** Absent/null = one-off event. Present = the event is (or becomes) a series. */
  readonly recurrence?: EventFormRecurrence | null
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
  /**
   * Hides the Repeat section at consumers whose submit path cannot persist a
   * rule — the plain-event edit sites (calendar popover edit, one-off event
   * edit). Default `true`. When `false`, the submitted payload omits the
   * `recurrence` key entirely rather than emitting it unused.
   */
  readonly showRecurrence?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_START_TIME = '09:00'
const DEFAULT_END_TIME = '10:00'
const ALL_DAY_START_TIME = '00:00'
const ALL_DAY_END_TIME = '23:59'
const DEFAULT_COLOR: CalendarEventColor = 'default'
const MAX_TITLE_LENGTH = 200

const DAY_ABBR = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
const DAY_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const
const WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6]

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** Nth-weekday ordinal options: First–Fourth map 1–4; "Last" is -1. */
const ORDINAL_OPTIONS: ReadonlyArray<{ readonly label: string; readonly value: number }> = [
  { label: 'First', value: 1 },
  { label: 'Second', value: 2 },
  { label: 'Third', value: 3 },
  { label: 'Fourth', value: 4 },
  { label: 'Last', value: -1 },
]

/** Occurrence counts above this collapse to "Last" (-1) instead of a 5th ordinal. */
const MAX_NORMAL_ORDINAL = 4
const DAYS_PER_WEEK = 7
/** Convert a 0-based `Date#getMonth()` to a 1-based calendar month. */
const MONTH_OFFSET = 1

// ─── Recurrence helpers ─────────────────────────────────────────────────────

/** Which occurrence of its weekday `date` is within its month (1-based), capped to "Last" (-1). */
function computeDefaultOrdinal(date: Date): number {
  const occurrence = Math.floor((date.getDate() - 1) / DAYS_PER_WEEK) + 1
  return occurrence > MAX_NORMAL_ORDINAL ? -1 : occurrence
}

/** Local `YYYY-MM-DD` string from a `Date`'s local getters (never `toISOString`). */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + MONTH_OFFSET).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Parses a local `YYYY-MM-DD` string into a local-midnight `Date`. */
function parseLocalDateString(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year!, month! - MONTH_OFFSET, day!)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EventFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  isPending = false,
  use24h = false,
  mode,
  showRecurrence = true,
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

  // ── Repeat (recurrence) ─────────────────────────────────────────────────
  const [freq, setFreq] = React.useState<SeriesFreq | 'none'>(
    initialValues?.recurrence?.freq ?? 'none',
  )
  const [weekdays, setWeekdays] = React.useState<number[]>(() => [
    ...(initialValues?.recurrence?.weekdays ?? []),
  ])
  const [monthlyMode, setMonthlyMode] = React.useState<'day' | 'nth'>(
    initialValues?.recurrence?.nthOrdinal !== undefined ? 'nth' : 'day',
  )
  const [nthOrdinal, setNthOrdinal] = React.useState<number | undefined>(
    initialValues?.recurrence?.nthOrdinal,
  )
  const [nthWeekday, setNthWeekday] = React.useState<number | undefined>(
    initialValues?.recurrence?.nthWeekday,
  )
  const [untilDate, setUntilDate] = React.useState<Date | undefined>(() => {
    const until = initialValues?.recurrence?.until
    return until ? parseLocalDateString(until) : undefined
  })

  const anchor = taskDate ?? new Date()

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
  const repeatId = React.useId()
  const monthlyModeId = React.useId()
  const untilId = React.useId()

  function handleFreqChange(value: string): void {
    const nextFreq = value as SeriesFreq | 'none'
    setFreq(nextFreq)
    if (nextFreq === 'weekly') {
      setWeekdays([anchor.getDay()])
    } else if (nextFreq === 'monthly') {
      setMonthlyMode('day')
    }
  }

  function handleMonthlyModeChange(value: string): void {
    const nextMode = value as 'day' | 'nth'
    setMonthlyMode(nextMode)
    if (nextMode === 'nth') {
      setNthOrdinal(computeDefaultOrdinal(anchor))
      setNthWeekday(anchor.getDay())
    }
  }

  function toggleWeekday(day: number): void {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    )
  }

  // Always emit a FULLY-FORMED rule for the selected freq (every rule-mode field
  // for that freq present, others absent) — updateSeries clears non-supplied
  // rule fields only on a freq CHANGE, so a partial payload would silently keep
  // stale fields on a same-freq edit (series wave issue #2).
  function buildRecurrence(): EventFormRecurrence | undefined {
    if (freq === 'none') return undefined
    const until = untilDate !== undefined ? toLocalDateString(untilDate) : undefined
    const untilField = until !== undefined ? { until } : {}

    if (freq === 'weekly') {
      return { freq, weekdays: [...weekdays].sort((a, b) => a - b), ...untilField }
    }
    if (freq === 'monthly') {
      if (monthlyMode === 'nth') {
        return {
          freq,
          nthOrdinal: nthOrdinal as number,
          nthWeekday: nthWeekday as number,
          ...untilField,
        }
      }
      return { freq, dayOfMonth: anchor.getDate(), ...untilField }
    }
    if (freq === 'yearly') {
      return {
        freq,
        month: anchor.getMonth() + MONTH_OFFSET,
        dayOfMonth: anchor.getDate(),
        ...untilField,
      }
    }
    return { freq, ...untilField }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault()

    // A date is required in both modes — all-day events map to real 00:00–23:59
    // instants of the picked local day so the library can place them.
    if (!taskDate) return

    const recurrence = showRecurrence ? buildRecurrence() : undefined

    onSubmit({
      title,
      startAt: buildIso(taskDate, allDay ? ALL_DAY_START_TIME : startTime),
      endAt: buildIso(taskDate, allDay ? ALL_DAY_END_TIME : endTime),
      allDay,
      color: color === DEFAULT_COLOR ? null : color,
      location: location.trim() || null,
      description: description.trim() || null,
      ...(recurrence !== undefined ? { recurrence } : {}),
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
      submitDisabled={
        title.trim() === '' || !taskDate || (freq === 'weekly' && weekdays.length === 0)
      }
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

      {/* Repeat — composes with all-day (all-day series emit real day-boundary instants). */}
      {showRecurrence && (
        <div className="border-border flex flex-col gap-3 border-t pt-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={repeatId}>Repeat</Label>
            <Select value={freq} onValueChange={handleFreqChange}>
              <SelectTrigger id={repeatId} aria-label="Repeat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Does not repeat</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {freq === 'weekly' && (
            <div className="flex gap-1.5" role="group" aria-label="Repeat days">
              {WEEKDAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-label={DAY_FULL[day]}
                  aria-pressed={weekdays.includes(day)}
                  onClick={() => toggleWeekday(day)}
                  className={
                    weekdays.includes(day)
                      ? 'focus-visible:ring-ring bg-primary text-primary-foreground h-8 w-8 rounded-full text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none'
                      : 'focus-visible:ring-ring border-input bg-background text-muted-foreground hover:text-foreground h-8 w-8 rounded-full border text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none'
                  }
                >
                  {DAY_ABBR[day]}
                </button>
              ))}
            </div>
          )}

          {freq === 'monthly' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={monthlyModeId}>Monthly mode</Label>
              <Select value={monthlyMode} onValueChange={handleMonthlyModeChange}>
                <SelectTrigger id={monthlyModeId} aria-label="Monthly mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">{`On day ${anchor.getDate()}`}</SelectItem>
                  <SelectItem value="nth">On the Nth weekday</SelectItem>
                </SelectContent>
              </Select>

              {monthlyMode === 'nth' && (
                <div className="flex gap-2">
                  <Select
                    value={String(nthOrdinal)}
                    onValueChange={(v) => setNthOrdinal(Number(v))}
                  >
                    <SelectTrigger aria-label="Ordinal" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDINAL_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(nthWeekday)}
                    onValueChange={(v) => setNthWeekday(Number(v))}
                  >
                    <SelectTrigger aria-label="Weekday" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((day) => (
                        <SelectItem key={day} value={String(day)}>
                          {DAY_FULL[day]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {freq === 'yearly' && (
            <p className="text-muted-foreground text-sm">
              {`Repeats every year on ${MONTH_NAMES[anchor.getMonth()]} ${anchor.getDate()}`}
            </p>
          )}

          {freq !== 'none' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={untilId}>Ends on</Label>
              <DatePicker value={untilDate} onValueChange={setUntilDate} placeholder="Ends on" />
            </div>
          )}
        </div>
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
