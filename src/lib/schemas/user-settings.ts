import { z } from 'zod'

export const modelSchema = z.enum(['claude-sonnet-4-6', 'claude-opus-4-7'])
export type SupportedModel = z.infer<typeof modelSchema>
