import { describe, it, expect } from 'vitest'
import { recordCompletionSchema, updateTaskDateSchema } from '@/lib/schemas/consistency'

describe('recordCompletionSchema', () => {
  it('accepts a payload with only a taskId', () => {
    expect(
      recordCompletionSchema.safeParse({
        taskId: '550e8400-e29b-41d4-a716-446655440000',
      }).success,
    ).toBe(true)
  })

  it('rejects an empty taskId', () => {
    expect(recordCompletionSchema.safeParse({ taskId: '' }).success).toBe(false)
  })

  it('rejects a missing taskId', () => {
    expect(recordCompletionSchema.safeParse({}).success).toBe(false)
  })
})

describe('updateTaskDateSchema', () => {
  it('accepts valid reschedule', () => {
    expect(
      updateTaskDateSchema.safeParse({
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        newStartAt: new Date().toISOString(),
      }).success,
    ).toBe(true)
  })

  it('rejects missing taskId', () => {
    expect(updateTaskDateSchema.safeParse({ newStartAt: new Date().toISOString() }).success).toBe(
      false,
    )
  })
})
