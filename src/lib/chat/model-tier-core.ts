import { z } from 'zod'

/**
 * Pure model-tier primitives — type, schema, and the runtime normalizer.
 *
 * Kept in a dedicated module with NO dependency on `@/lib/ai` (which reads the
 * server-only `ANTHROPIC_API_KEY`) so client components can value-import
 * `normalizeTier`/`ModelTier` without dragging the server env into the client
 * bundle. `model-tiers.ts` (which builds `MODEL_TIERS` from `@/lib/ai` model
 * instances) re-exports these for server consumers.
 */

export type ModelTier = 'sonnet' | 'opus'

export const modelTierSchema: z.ZodEnum<['sonnet', 'opus']> = z.enum(['sonnet', 'opus'])

const LEGACY_FALLBACK_TIER: ModelTier = 'sonnet'

/**
 * Normalizes a stored/runtime model-tier value to a valid `ModelTier`.
 * `conversations.model` is `text`-with-TS-enum, so a row created while a
 * since-removed tier (e.g. `'haiku'`) was selectable is typed `ModelTier`
 * at compile time but can hold a stale value at runtime — this guard keeps
 * that value from reaching `ModelTierSelect` unmapped (blank trigger).
 */
export function normalizeTier(value: string): ModelTier {
  return modelTierSchema.safeParse(value).success ? (value as ModelTier) : LEGACY_FALLBACK_TIER
}
