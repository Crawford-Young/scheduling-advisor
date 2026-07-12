import { describe, it, expect } from 'vitest'
import {
  createTaskSchema,
  updateTaskSchema,
  deleteTaskSchema,
  updateSeriesSchema,
} from '@/lib/schemas/task'

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

  it('accepts a valid IANA timeZone', () => {
    const result = createTaskSchema.safeParse({
      title: 'test',
      type: 'task',
      timeZone: 'America/New_York',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a garbage timeZone', () => {
    const result = createTaskSchema.safeParse({
      title: 'test',
      type: 'task',
      timeZone: 'Not/AZone',
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

  it('accepts a boolean locked flag', () => {
    const result = updateTaskSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      locked: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-boolean locked flag', () => {
    const result = updateTaskSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      locked: 'yes',
    })
    expect(result.success).toBe(false)
  })
})

describe('deleteTaskSchema', () => {
  it('accepts valid uuid', () => {
    const result = deleteTaskSchema.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result.success).toBe(true)
  })
})

describe('updateSeriesSchema', () => {
  const VALID_ID = '550e8400-e29b-41d4-a716-446655440000'

  it('accepts a full valid payload', () => {
    const result = updateSeriesSchema.safeParse({
      taskId: VALID_ID,
      title: 'Run',
      color: 'blue',
      location: 'Gym',
      description: 'leg day',
      allDay: false,
      startAt: '2026-05-18T09:00:00.000Z',
      endAt: '2026-05-18T10:00:00.000Z',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Tue'],
      recurrenceCount: 2,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a minimal payload with only taskId', () => {
    expect(updateSeriesSchema.safeParse({ taskId: VALID_ID }).success).toBe(true)
  })

  it('rejects a non-uuid taskId', () => {
    expect(updateSeriesSchema.safeParse({ taskId: 'not-a-uuid' }).success).toBe(false)
  })

  it('rejects an oversize title (>200 chars)', () => {
    const result = updateSeriesSchema.safeParse({ taskId: VALID_ID, title: 'x'.repeat(201) })
    expect(result.success).toBe(false)
  })

  it('rejects an empty title', () => {
    expect(updateSeriesSchema.safeParse({ taskId: VALID_ID, title: '' }).success).toBe(false)
  })

  it('rejects an invalid recurrence enum value', () => {
    const result = updateSeriesSchema.safeParse({ taskId: VALID_ID, recurrence: 'yearly' })
    expect(result.success).toBe(false)
  })

  it('rejects recurrenceCount below 1', () => {
    expect(updateSeriesSchema.safeParse({ taskId: VALID_ID, recurrenceCount: 0 }).success).toBe(
      false,
    )
  })

  it('rejects recurrenceCount above 52', () => {
    expect(updateSeriesSchema.safeParse({ taskId: VALID_ID, recurrenceCount: 53 }).success).toBe(
      false,
    )
  })

  it('accepts null for the nullable fields', () => {
    const result = updateSeriesSchema.safeParse({
      taskId: VALID_ID,
      color: null,
      location: null,
      description: null,
      endAt: null,
      recurrence: null,
      recurrenceCount: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown recurrenceDays tokens', () => {
    const result = updateSeriesSchema.safeParse({
      taskId: VALID_ID,
      recurrenceDays: ['Monday'],
    })
    expect(result.success).toBe(false)
  })

  it('accepts a valid IANA timeZone', () => {
    const result = updateSeriesSchema.safeParse({ taskId: VALID_ID, timeZone: 'Europe/London' })
    expect(result.success).toBe(true)
  })

  it('rejects a garbage timeZone', () => {
    const result = updateSeriesSchema.safeParse({ taskId: VALID_ID, timeZone: 'Middle/Earth' })
    expect(result.success).toBe(false)
  })
})
