import { describe, it, expect } from 'vitest'
import { computeWeightedTokens } from '@/lib/chat/token-weights'

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

  it('cache read discounts to 0.1x', () => {
    expect(
      computeWeightedTokens({
        promptTokens: 10000,
        completionTokens: 0,
        cacheReadTokens: 9000,
        cacheWriteTokens: 0,
      }),
    ).toBe(1000 + 900)
  })

  it('cache write costs 1.25x', () => {
    expect(
      computeWeightedTokens({
        promptTokens: 4000,
        completionTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 4000,
      }),
    ).toBe(5000)
  })

  it('never negative uncached input', () => {
    expect(
      computeWeightedTokens({
        promptTokens: 100,
        completionTokens: 0,
        cacheReadTokens: 500,
        cacheWriteTokens: 0,
      }),
    ).toBe(50)
  })
})
