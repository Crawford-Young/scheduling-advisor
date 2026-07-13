import { describe, it, expect } from 'vitest'
import { computeWeightedTokens } from '@/lib/chat/token-weights'

// promptTokens is the AI SDK's usage.promptTokens, which maps 1:1 to Anthropic's
// usage.input_tokens — already NET of cache reads/writes. No subtraction.
describe('computeWeightedTokens', () => {
  it('no cache: 1:1 with prompt+completion', () => {
    expect(
      computeWeightedTokens({
        promptTokens: 1000,
        completionTokens: 200,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBe(1200)
  })

  it('cache read adds 0.1x on top of net prompt tokens', () => {
    expect(
      computeWeightedTokens({
        promptTokens: 1000,
        completionTokens: 0,
        cacheReadTokens: 9000,
        cacheWriteTokens: 0,
      }),
    ).toBe(1000 + 900)
  })

  it('cache write adds 1.25x on top of net prompt tokens', () => {
    expect(
      computeWeightedTokens({
        promptTokens: 0,
        completionTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 4000,
      }),
    ).toBe(5000)
  })

  it('combined: net input + read discount + write premium + output', () => {
    expect(
      computeWeightedTokens({
        promptTokens: 100,
        completionTokens: 200,
        cacheReadTokens: 500,
        cacheWriteTokens: 400,
      }),
    ).toBe(100 + 50 + 500 + 200)
  })

  it('ceils fractional totals', () => {
    expect(
      computeWeightedTokens({
        promptTokens: 0,
        completionTokens: 0,
        cacheReadTokens: 5,
        cacheWriteTokens: 0,
      }),
    ).toBe(1)
  })
})
