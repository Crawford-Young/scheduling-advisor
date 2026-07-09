import { describe, it, expect } from 'vitest'
import { createTaskSchema, updateTaskSchema, updateSeriesSchema } from '@/lib/schemas/task'

describe('createTaskSchema', () => {
  it('accepts rich fields', () => {
    const r = createTaskSchema.safeParse({
      type: 'task',
      title: 'x',
      color: 'blue',
      location: 'Gym',
      description: 'leg day',
      allDay: true,
    })
    expect(r.success).toBe(true)
  })

  it('rejects type habit', () => {
    expect(createTaskSchema.safeParse({ type: 'habit', title: 'x' }).success).toBe(false)
  })
})

describe('updateTaskSchema', () => {
  it('accepts allDay false + nullable color', () => {
    const r = updateTaskSchema.safeParse({
      id: crypto.randomUUID(),
      color: null,
      allDay: false,
    })
    expect(r.success).toBe(true)
  })

  it('accepts a boolean locked flag', () => {
    const r = updateTaskSchema.safeParse({ id: crypto.randomUUID(), locked: true })
    expect(r.success).toBe(true)
  })

  it('rejects a non-boolean locked flag', () => {
    const r = updateTaskSchema.safeParse({ id: crypto.randomUUID(), locked: 'yes' })
    expect(r.success).toBe(false)
  })
})

describe('updateSeriesSchema', () => {
  it('accepts a rich shared-field payload', () => {
    const r = updateSeriesSchema.safeParse({
      taskId: crypto.randomUUID(),
      title: 'x',
      color: null,
      allDay: true,
      recurrence: 'daily',
      recurrenceCount: 5,
    })
    expect(r.success).toBe(true)
  })

  it('rejects a non-uuid taskId', () => {
    expect(updateSeriesSchema.safeParse({ taskId: 'nope' }).success).toBe(false)
  })

  it('rejects an out-of-range recurrenceCount', () => {
    expect(
      updateSeriesSchema.safeParse({ taskId: crypto.randomUUID(), recurrenceCount: 53 }).success,
    ).toBe(false)
  })
})
