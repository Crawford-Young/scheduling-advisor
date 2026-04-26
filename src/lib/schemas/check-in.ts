import { z } from 'zod'

export const createCheckInSchema = z.object({
  taskId: z.string().uuid().nullable().optional(),
  scheduledAt: z.string().datetime(),
})

export const completeCheckInSchema = z.object({
  id: z.string().uuid(),
  reflectionText: z.string().min(1).max(2000).optional(),
  rating: z.number().int().min(1).max(5),
})

export type CreateCheckIn = z.infer<typeof createCheckInSchema>
export type CompleteCheckIn = z.infer<typeof completeCheckInSchema>
