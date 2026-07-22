import { createAnthropic } from '@ai-sdk/anthropic'
import { env } from '@/env'

const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })

// @ai-sdk/anthropic@4's model factory takes only the model id — the v1
// `{ cacheControl: true }` settings arg is gone. Message-level
// providerOptions.anthropic.cacheControl is now honored by default and cache
// token counts surface on usage.inputTokenDetails, so weighted billing keeps
// working without an opt-in flag.
export const tierModels = {
  sonnet: anthropic('claude-sonnet-4-6'),
  opus: anthropic('claude-opus-4-8'),
} as const
