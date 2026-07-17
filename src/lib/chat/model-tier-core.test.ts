import { describe, it, expect } from 'vitest'
import { modelTierSchema, normalizeTier } from '@/lib/chat/model-tier-core'

// No @/lib/ai or @/env mock here on purpose: the core module must stay pure
// (zod only) so client components can import it without pulling the server env.
// If it ever imports @/lib/ai, this file throws at import and fails.
describe('modelTierSchema', () => {
  it('accepts sonnet, opus and rejects anything else (haiku now rejected)', () => {
    expect(modelTierSchema.safeParse('sonnet').success).toBe(true)
    expect(modelTierSchema.safeParse('opus').success).toBe(true)
    expect(modelTierSchema.safeParse('haiku').success).toBe(false)
    expect(modelTierSchema.safeParse('gpt4').success).toBe(false)
  })
})

describe('normalizeTier', () => {
  it('passes through valid tiers unchanged', () => {
    expect(normalizeTier('sonnet')).toBe('sonnet')
    expect(normalizeTier('opus')).toBe('opus')
  })

  it('defaults a legacy haiku value to sonnet', () => {
    expect(normalizeTier('haiku')).toBe('sonnet')
  })

  it('defaults an unrecognized value to sonnet', () => {
    expect(normalizeTier('gpt4')).toBe('sonnet')
  })
})
