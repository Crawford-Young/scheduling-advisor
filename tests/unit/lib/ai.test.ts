import { describe, it, expect, vi } from 'vitest'

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn((id: string) => ({ modelId: id }))),
}))
vi.mock('@/env', () => ({ env: { ANTHROPIC_API_KEY: 'test-key' } }))

describe('ai models', () => {
  it('exposes advisor (sonnet) and quick (haiku) models', async () => {
    const { advisorModel, quickModel } = await import('@/lib/ai')
    expect((advisorModel as { modelId: string }).modelId).toBe('claude-sonnet-4-6')
    expect((quickModel as { modelId: string }).modelId).toBe('claude-haiku-4-5')
  })
})
