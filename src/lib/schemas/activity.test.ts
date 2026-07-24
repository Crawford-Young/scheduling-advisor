import { describe, it, expect } from 'vitest'
import { createActivitySchema, updateActivitySchema } from '@/lib/schemas/activity'

describe('createActivitySchema', () => {
  const baseValid = {
    title: 'Gym',
    minDurationMin: 30,
    maxDurationMin: 60,
    weeklyTargetSessions: 3,
  }

  it('accepts a valid payload with all fields', () => {
    const r = createActivitySchema.safeParse({
      ...baseValid,
      color: 'blue',
      description: 'leg day',
      defaultLocation: 'Downtown gym',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a metadata-only payload with just the required fields', () => {
    const r = createActivitySchema.safeParse(baseValid)
    expect(r.success).toBe(true)
  })

  it('rejects when minDurationMin > maxDurationMin', () => {
    const r = createActivitySchema.safeParse({
      ...baseValid,
      minDurationMin: 90,
      maxDurationMin: 60,
    })
    expect(r.success).toBe(false)
  })

  it('accepts minDurationMin === maxDurationMin', () => {
    const r = createActivitySchema.safeParse({
      ...baseValid,
      minDurationMin: 60,
      maxDurationMin: 60,
    })
    expect(r.success).toBe(true)
  })

  it('rejects an empty title', () => {
    const r = createActivitySchema.safeParse({ ...baseValid, title: '' })
    expect(r.success).toBe(false)
  })

  it('rejects weeklyTargetSessions below 1', () => {
    const r = createActivitySchema.safeParse({ ...baseValid, weeklyTargetSessions: 0 })
    expect(r.success).toBe(false)
  })
})

describe('updateActivitySchema', () => {
  it('accepts a partial payload with only id + title', () => {
    const r = updateActivitySchema.safeParse({ id: crypto.randomUUID(), title: 'New name' })
    expect(r.success).toBe(true)
  })

  it('rejects a non-uuid id', () => {
    const r = updateActivitySchema.safeParse({ id: 'nope', title: 'x' })
    expect(r.success).toBe(false)
  })

  it('rejects when both bounds are supplied and min > max', () => {
    const r = updateActivitySchema.safeParse({
      id: crypto.randomUUID(),
      minDurationMin: 90,
      maxDurationMin: 60,
    })
    expect(r.success).toBe(false)
  })

  it('accepts a partial payload updating only metadata', () => {
    const r = updateActivitySchema.safeParse({
      id: crypto.randomUUID(),
      weeklyTargetSessions: 5,
    })
    expect(r.success).toBe(true)
  })
})
