import { z } from 'zod'

export const taskTypeSchema = z.enum(['task', 'goal'])
export const taskStatusSchema = z.enum(['pending', 'in_progress', 'completed'])

// Weekday tokens for multi-day (weekly) recurrence. These MUST match the
// `@crawfordyoung/ui` calendar `DayOfWeek` union (dist DAY_ABBR) exactly — the
// library emits these strings in `onEventCreate`/`onEventEdit` recurrenceDays.
export const dayOfWeekSchema = z.enum(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])

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
})

export const deleteTaskSchema = z.object({
  id: z.string().uuid(),
})

export type DayOfWeek = z.infer<typeof dayOfWeekSchema>
export type CreateTask = z.infer<typeof createTaskSchema>
export type UpdateTask = z.infer<typeof updateTaskSchema>
export type DeleteTask = z.infer<typeof deleteTaskSchema>
