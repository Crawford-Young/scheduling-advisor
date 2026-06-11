import { z } from 'zod'

export const chatRequestSchema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1),
  conversationId: z.string().uuid(),
})
