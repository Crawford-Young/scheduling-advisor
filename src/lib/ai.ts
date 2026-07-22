import { createAnthropic } from '@ai-sdk/anthropic'
import { env } from '@/env'

const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })

// cacheControl: true is load-bearing — without it @ai-sdk/anthropic@1.0.5 strips
// message-level providerOptions.anthropic.cacheControl AND omits cache token
// fields from providerMetadata (weighted billing would silently degrade to 1:1).
export const tierModels = {
  sonnet: anthropic('claude-sonnet-4-6', { cacheControl: true }),
  opus: anthropic('claude-opus-4-8', { cacheControl: true }),
} as const
