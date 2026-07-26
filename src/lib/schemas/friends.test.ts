import { describe, it, expect } from 'vitest'
import { sendFriendRequestSchema, friendshipTargetSchema } from '@/lib/schemas/friends'

const VALID_UUID = '75fa6447-bbbd-43bc-9f9e-a4117b27e1e5'

describe('sendFriendRequestSchema', () => {
  it('accepts a valid uuid addresseeId', () => {
    const result = sendFriendRequestSchema.safeParse({ addresseeId: VALID_UUID })

    expect(result.success).toBe(true)
  })

  it('rejects a non-uuid addresseeId', () => {
    const result = sendFriendRequestSchema.safeParse({ addresseeId: 'not-a-uuid' })

    expect(result.success).toBe(false)
  })

  it('rejects a missing addresseeId', () => {
    const result = sendFriendRequestSchema.safeParse({})

    expect(result.success).toBe(false)
  })
})

describe('friendshipTargetSchema', () => {
  it('accepts a valid uuid friendshipId', () => {
    const result = friendshipTargetSchema.safeParse({ friendshipId: VALID_UUID })

    expect(result.success).toBe(true)
  })

  it('rejects a non-uuid friendshipId', () => {
    const result = friendshipTargetSchema.safeParse({ friendshipId: 'not-a-uuid' })

    expect(result.success).toBe(false)
  })

  it('rejects a missing friendshipId', () => {
    const result = friendshipTargetSchema.safeParse({})

    expect(result.success).toBe(false)
  })
})
