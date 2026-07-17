import type { LanguageModelV1 } from 'ai'
import { tierModels } from '@/lib/ai'
import { type ModelTier, modelTierSchema, normalizeTier } from '@/lib/chat/model-tier-core'

// Re-export the pure primitives so existing server importers can keep pulling
// them from '@/lib/chat/model-tiers'. Client components must import them from
// '@/lib/chat/model-tier-core' directly — this module value-imports @/lib/ai
// (server-only ANTHROPIC_API_KEY) via MODEL_TIERS below.
export { modelTierSchema, normalizeTier }
export type { ModelTier }

export interface ModelTierConfig {
  readonly tier: ModelTier
  readonly model: LanguageModelV1
  readonly multiplier: number
  readonly label: string
}

const SONNET_MULTIPLIER = 1
const OPUS_MULTIPLIER = 2

export const MODEL_TIERS: Record<ModelTier, ModelTierConfig> = {
  sonnet: {
    tier: 'sonnet',
    model: tierModels.sonnet,
    multiplier: SONNET_MULTIPLIER,
    label: 'Sonnet',
  },
  opus: {
    tier: 'opus',
    model: tierModels.opus,
    multiplier: OPUS_MULTIPLIER,
    label: 'Opus',
  },
}
