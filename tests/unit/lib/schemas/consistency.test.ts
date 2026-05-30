import { describe, it, expect } from 'vitest'
import { recordCompletionSchema, updateTaskDateSchema } from '@/lib/schemas/consistency'

describe('recordCompletionSchema', () => {
  it('accepts done outcome', () => {
    expect(
      recordCompletionSchema.safeParse({
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        outcome: 'done',
      }).success,
    ).toBe(true)
  })

  it('accepts skip outcome', () => {
    expect(
      recordCompletionSchema.safeParse({
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        outcome: 'skip',
      }).success,
    ).toBe(true)
  })

  it('rejects unknown outcome', () => {
    expect(
      recordCompletionSchema.safeParse({
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        outcome: 'done_later',
      }).success,
    ).toBe(false)
  })

  it('rejects invalid uuid', () => {
    expect(
      recordCompletionSchema.safeParse({ taskId: 'not-a-uuid', outcome: 'done' }).success,
    ).toBe(false)
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
