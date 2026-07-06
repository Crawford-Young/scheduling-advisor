import { z } from 'zod'

export const recordCompletionSchema = z.object({
  taskId: z.string().min(1),
})

export const updateTaskDateSchema = z.object({
  taskId: z.string().uuid(),
  newStartAt: z.string().datetime().optional(),
  newEndAt: z.string().datetime().optional(),
  newTargetDate: z.string().datetime().optional(),
})

export type RecordCompletion = z.infer<typeof recordCompletionSchema>
export type UpdateTaskDate = z.infer<typeof updateTaskDateSchema>
