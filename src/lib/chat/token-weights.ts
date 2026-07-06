export interface TokenUsageBreakdown {
  readonly promptTokens: number
  readonly completionTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

const CACHE_READ_WEIGHT = 0.1
const CACHE_WRITE_WEIGHT = 1.25
const UNCACHED_INPUT_WEIGHT = 1
const OUTPUT_WEIGHT = 1
const MIN_UNCACHED_INPUT = 0

export function computeWeightedTokens(usage: TokenUsageBreakdown): number {
  const uncachedInput = Math.max(
    MIN_UNCACHED_INPUT,
    usage.promptTokens - usage.cacheReadTokens - usage.cacheWriteTokens,
  )

  const weighted =
    uncachedInput * UNCACHED_INPUT_WEIGHT +
    usage.cacheReadTokens * CACHE_READ_WEIGHT +
    usage.cacheWriteTokens * CACHE_WRITE_WEIGHT +
    usage.completionTokens * OUTPUT_WEIGHT

  return Math.ceil(weighted)
}
