import { z } from 'zod'

export const taskTypeSchema = z.enum(['task', 'goal', 'habit'])
export const taskStatusSchema = z.enum(['pending', 'in_progress', 'completed'])

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title required').max(200),
  type: taskTypeSchema,
  recurrence: z.string().nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
})

export const updateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  status: taskStatusSchema.optional(),
  recurrence: z.string().nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
})

export const deleteTaskSchema = z.object({
  id: z.string().uuid(),
})

export type CreateTask = z.infer<typeof createTaskSchema>
export type UpdateTask = z.infer<typeof updateTaskSchema>
export type DeleteTask = z.infer<typeof deleteTaskSchema>
