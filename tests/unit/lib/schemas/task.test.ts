import { describe, it, expect } from 'vitest'
import { createTaskSchema, updateTaskSchema, deleteTaskSchema } from '@/lib/schemas/task'

describe('createTaskSchema', () => {
  it('accepts valid task', () => {
    const result = createTaskSchema.safeParse({ title: 'Run 5k', type: 'goal' })
    expect(result.success).toBe(true)
  })

  it('accepts task with recurrence', () => {
    const result = createTaskSchema.safeParse({
      title: 'Meditate',
      type: 'task',
      recurrence: 'RRULE:FREQ=DAILY',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty title', () => {
    const result = createTaskSchema.safeParse({ title: '', type: 'task' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid type', () => {
    const result = createTaskSchema.safeParse({ title: 'Foo', type: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('accepts valid recurrenceDays weekday tokens', () => {
    const result = createTaskSchema.safeParse({
      title: 'test',
      type: 'task',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown recurrenceDays tokens', () => {
    const result = createTaskSchema.safeParse({
      title: 'test',
      type: 'task',
      recurrence: 'weekly',
      recurrenceDays: ['Monday'],
    })
    expect(result.success).toBe(false)
  })
})

describe('updateTaskSchema', () => {
  it('accepts partial update', () => {
    const result = updateTaskSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'completed',
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-uuid id', () => {
    const result = updateTaskSchema.safeParse({ id: 'not-a-uuid', status: 'completed' })
    expect(result.success).toBe(false)
  })
})

describe('deleteTaskSchema', () => {
  it('accepts valid uuid', () => {
    const result = deleteTaskSchema.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result.success).toBe(true)
  })
})
