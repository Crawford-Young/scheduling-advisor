import { z } from 'zod'

const QUICK_MAX_TRANSCRIPT = 6

export const chatRequestSchema = z
  .object({
    messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1),
    conversationId: z.string().uuid().optional(),
    mode: z.enum(['quick-schedule']).optional(),
  })
  .refine((d) => d.conversationId !== undefined || d.mode === 'quick-schedule', {
    message: 'conversationId required unless mode is quick-schedule',
  })
  .refine((d) => d.mode !== 'quick-schedule' || d.messages.length <= QUICK_MAX_TRANSCRIPT, {
    message: 'quick-schedule transcript too long',
  })
