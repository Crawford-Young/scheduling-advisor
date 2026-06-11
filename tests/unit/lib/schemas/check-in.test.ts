import { describe, it, expect } from 'vitest'
import { createCheckInSchema, completeCheckInSchema } from '@/lib/schemas/check-in'

describe('createCheckInSchema', () => {
  it('accepts check-in without taskId', () => {
    const result = createCheckInSchema.safeParse({ scheduledAt: new Date().toISOString() })
    expect(result.success).toBe(true)
  })

  it('accepts check-in with taskId', () => {
    const result = createCheckInSchema.safeParse({
      taskId: '550e8400-e29b-41d4-a716-446655440000',
      scheduledAt: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
  })
})

describe('completeCheckInSchema', () => {
  it('accepts rating 1–5', () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      const result = completeCheckInSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        rating,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects rating 0', () => {
    const result = completeCheckInSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      rating: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects rating 6', () => {
    const result = completeCheckInSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      rating: 6,
    })
    expect(result.success).toBe(false)
  })
})
