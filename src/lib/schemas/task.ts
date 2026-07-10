import { z } from 'zod'

export const taskTypeSchema = z.enum(['task', 'goal'])
export const taskStatusSchema = z.enum(['pending', 'in_progress', 'completed'])

// Weekday tokens for multi-day (weekly) recurrence. These MUST match the
// `@crawfordyoung/ui` calendar `DayOfWeek` union (dist DAY_ABBR) exactly — the
// library emits these strings in `onEventCreate`/`onEventEdit` recurrenceDays.
export const dayOfWeekSchema = z.enum(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])

// A set of selected weekday tokens for a weekly recurrence pattern.
export const dayTokenArraySchema = z.array(dayOfWeekSchema).readonly()

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title required').max(200),
  type: taskTypeSchema,
  recurrence: z.string().nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  recurrenceCount: z.number().int().min(2).max(52).optional(),
  // Selected weekdays for a multi-day weekly create (library drag-create popover).
  // Only honoured when recurrence === 'weekly'; drives per-weekday fan-out.
  recurrenceDays: z.array(dayOfWeekSchema).readonly().optional(),
  color: z.string().max(32).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  allDay: z.boolean().optional(),
})

export const updateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  status: taskStatusSchema.optional(),
  recurrence: z.string().nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  allDay: z.boolean().optional(),
  // Pins a row in place: the library gates start/end edits client-side; the
  // server only persists the flag (no start/end rejection on locked rows).
  locked: z.boolean().optional(),
})

export const deleteTaskSchema = z.object({
  id: z.string().uuid(),
})

// Single grouped-row edit contract (wave 2.6): every field here except `taskId`
// is a SHARED field propagated across the whole recurrence group. `status` and
// `locked` are per-occurrence and never appear — updateSeries never writes them.
// startAt/endAt carry the time-of-day template (calendar dates are preserved
// per-row). recurrence null clears the pattern; a frequency triggers regeneration.
export const updateSeriesSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  color: z.string().max(32).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  allDay: z.boolean().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  recurrence: z.enum(['daily', 'weekly', 'monthly']).nullable().optional(),
  recurrenceDays: dayTokenArraySchema.optional(),
  recurrenceCount: z.number().int().min(1).max(52).nullable().optional(),
})

export type DayOfWeek = z.infer<typeof dayOfWeekSchema>
export type CreateTask = z.infer<typeof createTaskSchema>
export type UpdateTask = z.infer<typeof updateTaskSchema>
export type DeleteTask = z.infer<typeof deleteTaskSchema>
export type UpdateSeries = z.infer<typeof updateSeriesSchema>

// The fields updateSeries propagates across every row of a recurrence group.
// `status`, streak and `locked` are per-occurrence and never appear here — that
// writer never touches them. S4/S5/S6/S7 consume this list verbatim. Lives here
// (not in series-mutations.ts) because a 'use server' module may only export
// async functions — a plain const export there 500s every importing page.
export const SERIES_SHARED_FIELDS = [
  'title',
  'color',
  'location',
  'description',
  'allDay',
  'recurrence',
  'recurrenceDays',
  'recurrenceCount',
] as const
export type SeriesSharedField = (typeof SERIES_SHARED_FIELDS)[number]
