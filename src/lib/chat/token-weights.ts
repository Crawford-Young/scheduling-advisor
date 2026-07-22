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

// promptTokens is the NET-of-cache input token count (ai@7: usage.inputTokenDetails.noCacheTokens;
// maps to Anthropic usage.input_tokens) — already excludes cache reads/writes, no subtraction here.
// Returns the RAW weighted float — callers apply the tier multiplier and perform the
// single Math.ceil rounding step so cache-class weighting and tier weighting share one round.
export function computeWeightedTokens(usage: TokenUsageBreakdown): number {
  return (
    usage.promptTokens * UNCACHED_INPUT_WEIGHT +
    usage.cacheReadTokens * CACHE_READ_WEIGHT +
    usage.cacheWriteTokens * CACHE_WRITE_WEIGHT +
    usage.completionTokens * OUTPUT_WEIGHT
  )
}
