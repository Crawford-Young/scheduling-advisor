import { describe, it, expect, vi } from 'vitest'

const modelFactory = vi.fn((id: string) => ({ modelId: id }))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => modelFactory),
}))
vi.mock('@/env', () => ({ env: { ANTHROPIC_API_KEY: 'test-key' } }))

describe('MODEL_TIERS', () => {
  it('has exactly two entries: sonnet, opus', async () => {
    const { MODEL_TIERS } = await import('@/lib/chat/model-tiers')
    expect(Object.keys(MODEL_TIERS).sort()).toEqual(['opus', 'sonnet'])
  })

  it('multiplies sonnet by 1, opus by 2', async () => {
    const { MODEL_TIERS } = await import('@/lib/chat/model-tiers')
    expect(MODEL_TIERS.sonnet.multiplier).toBe(1)
    expect(MODEL_TIERS.opus.multiplier).toBe(2)
  })

  it('labels each tier Sonnet/Opus', async () => {
    const { MODEL_TIERS } = await import('@/lib/chat/model-tiers')
    expect(MODEL_TIERS.sonnet.label).toBe('Sonnet')
    expect(MODEL_TIERS.opus.label).toBe('Opus')
  })

  it('carries the correct tier field per entry', async () => {
    const { MODEL_TIERS } = await import('@/lib/chat/model-tiers')
    expect(MODEL_TIERS.sonnet.tier).toBe('sonnet')
    expect(MODEL_TIERS.opus.tier).toBe('opus')
  })

  it('resolves to model ids claude-sonnet-4-6 / claude-opus-4-8', async () => {
    const { MODEL_TIERS } = await import('@/lib/chat/model-tiers')
    expect((MODEL_TIERS.sonnet.model as { modelId: string }).modelId).toBe('claude-sonnet-4-6')
    expect((MODEL_TIERS.opus.model as { modelId: string }).modelId).toBe('claude-opus-4-8')
  })

  it('constructs every anthropic model with only the model id (v7 factory takes no settings arg)', async () => {
    await import('@/lib/chat/model-tiers')
    expect(modelFactory).toHaveBeenCalledWith('claude-sonnet-4-6')
    expect(modelFactory).toHaveBeenCalledWith('claude-opus-4-8')
  })

  it('re-exports the pure core primitives for server consumers', async () => {
    const { modelTierSchema, normalizeTier } = await import('@/lib/chat/model-tiers')
    expect(modelTierSchema.safeParse('opus').success).toBe(true)
    expect(normalizeTier('haiku')).toBe('sonnet')
  })
})
