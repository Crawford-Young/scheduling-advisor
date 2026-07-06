import { describe, it, expect } from 'vitest'
import { chatRequestSchema } from '@/lib/schemas/chat'

const msg = [{ role: 'user', content: 'hi' }]

describe('chatRequestSchema', () => {
  it('accepts persisted shape (conversationId, no mode)', () => {
    expect(
      chatRequestSchema.safeParse({ messages: msg, conversationId: crypto.randomUUID() }).success,
    ).toBe(true)
  })
  it('accepts ephemeral quick-schedule shape (mode, no conversationId)', () => {
    expect(chatRequestSchema.safeParse({ messages: msg, mode: 'quick-schedule' }).success).toBe(
      true,
    )
  })
  it('rejects neither-mode-nor-conversationId', () => {
    expect(chatRequestSchema.safeParse({ messages: msg }).success).toBe(false)
  })
  it('rejects unknown mode', () => {
    expect(chatRequestSchema.safeParse({ messages: msg, mode: 'week-planner' }).success).toBe(false)
  })
  it('rejects quick-schedule transcripts longer than 6 messages', () => {
    const long = Array.from({ length: 7 }, () => ({ role: 'user', content: 'x' }))
    expect(chatRequestSchema.safeParse({ messages: long, mode: 'quick-schedule' }).success).toBe(
      false,
    )
  })
})
