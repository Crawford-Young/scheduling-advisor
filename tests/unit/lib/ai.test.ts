import { describe, it, expect, vi } from 'vitest'

const modelFactory = vi.fn((id: string, settings?: { cacheControl?: boolean }) => ({
  modelId: id,
  settings,
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => modelFactory),
}))
vi.mock('@/env', () => ({ env: { ANTHROPIC_API_KEY: 'test-key' } }))

describe('ai models', () => {
  it('exposes tierModels (sonnet/opus) and the standalone quick (haiku) model', async () => {
    const { tierModels, quickModel } = await import('@/lib/ai')
    expect((tierModels.sonnet as { modelId: string }).modelId).toBe('claude-sonnet-4-6')
    expect((tierModels.opus as { modelId: string }).modelId).toBe('claude-opus-4-8')
    expect((quickModel as { modelId: string }).modelId).toBe('claude-haiku-4-5')
  })

  it('enables provider cacheControl on every model (required for cache_control passthrough and cache token reporting)', async () => {
    await import('@/lib/ai')
    expect(modelFactory).toHaveBeenCalledWith('claude-haiku-4-5', { cacheControl: true })
    expect(modelFactory).toHaveBeenCalledWith('claude-sonnet-4-6', { cacheControl: true })
    expect(modelFactory).toHaveBeenCalledWith('claude-opus-4-8', { cacheControl: true })
  })
})
