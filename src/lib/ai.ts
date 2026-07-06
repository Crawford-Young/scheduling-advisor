import { createAnthropic } from '@ai-sdk/anthropic'
import { env } from '@/env'

const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })

export const advisorModel = anthropic('claude-sonnet-4-6')
export const quickModel = anthropic('claude-haiku-4-5')
