import { z } from 'zod'

export const ANTHROPIC_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'claude-haiku-4-5',
] as const

export const GOOGLE_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
] as const

export const ALL_MODELS = [...ANTHROPIC_MODELS, ...GOOGLE_MODELS] as const

export type Provider = 'anthropic' | 'google'
export type AnthropicModel = (typeof ANTHROPIC_MODELS)[number]
export type GoogleModel = (typeof GOOGLE_MODELS)[number]

export const providerSchema = z.enum(['anthropic', 'google'])
export const modelSchema = z.enum(ALL_MODELS)

export const MODELS_BY_PROVIDER: Record<Provider, ReadonlyArray<string>> = {
  anthropic: ANTHROPIC_MODELS,
  google: GOOGLE_MODELS,
}

export const DEFAULT_MODEL_BY_PROVIDER: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-6',
  google: 'gemini-2.0-flash',
}
