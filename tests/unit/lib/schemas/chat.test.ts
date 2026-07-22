import { describe, it, expect } from 'vitest'
import { chatRequestSchema } from '@/lib/schemas/chat'

const msg = [{ role: 'user', content: 'hi' }]

describe('chatRequestSchema', () => {
  it('accepts persisted shape (conversationId, no mode)', () => {
    expect(
      chatRequestSchema.safeParse({ messages: msg, conversationId: crypto.randomUUID() }).success,
    ).toBe(true)
  })
  it('rejects requests without conversationId', () => {
    expect(chatRequestSchema.safeParse({ messages: msg }).success).toBe(false)
  })
})
