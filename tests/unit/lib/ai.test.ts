import { describe, it, expect, vi } from 'vitest'

const modelFactory = vi.fn((id: string) => ({ modelId: id }))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => modelFactory),
}))
vi.mock('@/env', () => ({ env: { ANTHROPIC_API_KEY: 'test-key' } }))

describe('ai models', () => {
  it('exposes tierModels (sonnet/opus)', async () => {
    const { tierModels } = await import('@/lib/ai')
    expect((tierModels.sonnet as { modelId: string }).modelId).toBe('claude-sonnet-4-6')
    expect((tierModels.opus as { modelId: string }).modelId).toBe('claude-opus-4-8')
  })

  it('constructs each model with only the model id (v7 factory takes no settings arg)', async () => {
    await import('@/lib/ai')
    expect(modelFactory).toHaveBeenCalledWith('claude-sonnet-4-6')
    expect(modelFactory).toHaveBeenCalledWith('claude-opus-4-8')
  })
})
