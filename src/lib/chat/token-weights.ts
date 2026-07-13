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

// promptTokens (AI SDK usage.promptTokens) maps 1:1 to Anthropic usage.input_tokens,
// which is already NET of cache reads/writes — no subtraction here.
export function computeWeightedTokens(usage: TokenUsageBreakdown): number {
  const weighted =
    usage.promptTokens * UNCACHED_INPUT_WEIGHT +
    usage.cacheReadTokens * CACHE_READ_WEIGHT +
    usage.cacheWriteTokens * CACHE_WRITE_WEIGHT +
    usage.completionTokens * OUTPUT_WEIGHT

  return Math.ceil(weighted)
}
