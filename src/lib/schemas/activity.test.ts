import { describe, it, expect } from 'vitest'
import {
  activityScheduleSlotSchema,
  createActivitySchema,
  updateActivitySchema,
} from '@/lib/schemas/activity'

describe('activityScheduleSlotSchema', () => {
  it('accepts an in-bounds slot', () => {
    const r = activityScheduleSlotSchema.safeParse({ day: 0, startMinutes: 0, durationMin: 30 })
    expect(r.success).toBe(true)
  })

  it('accepts the highest in-bounds day and startMinutes', () => {
    const r = activityScheduleSlotSchema.safeParse({
      day: 6,
      startMinutes: 1439,
      durationMin: 15,
    })
    expect(r.success).toBe(true)
  })

  it('rejects a day above 6', () => {
    const r = activityScheduleSlotSchema.safeParse({ day: 7, startMinutes: 0, durationMin: 30 })
    expect(r.success).toBe(false)
  })

  it('rejects a negative day', () => {
    const r = activityScheduleSlotSchema.safeParse({ day: -1, startMinutes: 0, durationMin: 30 })
    expect(r.success).toBe(false)
  })

  it('rejects startMinutes at or above 1440', () => {
    const r = activityScheduleSlotSchema.safeParse({
      day: 0,
      startMinutes: 1440,
      durationMin: 30,
    })
    expect(r.success).toBe(false)
  })

  it('rejects a non-positive durationMin', () => {
    const r = activityScheduleSlotSchema.safeParse({ day: 0, startMinutes: 0, durationMin: 0 })
    expect(r.success).toBe(false)
  })
})

describe('createActivitySchema', () => {
  const baseValid = {
    title: 'Gym',
    minDurationMin: 30,
    maxDurationMin: 60,
    weeklyTargetSessions: 3,
    schedule: [{ day: 1, startMinutes: 540, durationMin: 45 }],
  }

  it('accepts a valid payload with all fields', () => {
    const r = createActivitySchema.safeParse({
      ...baseValid,
      color: 'blue',
      description: 'leg day',
      defaultLocation: 'Downtown gym',
      timeZone: 'America/New_York',
    })
    expect(r.success).toBe(true)
  })

  it('accepts an empty schedule', () => {
    const r = createActivitySchema.safeParse({ ...baseValid, schedule: [] })
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
      schedule: [{ day: 1, startMinutes: 540, durationMin: 60 }],
    })
    expect(r.success).toBe(true)
  })

  it('rejects a schedule slot durationMin below minDurationMin', () => {
    const r = createActivitySchema.safeParse({
      ...baseValid,
      minDurationMin: 30,
      maxDurationMin: 60,
      schedule: [{ day: 1, startMinutes: 540, durationMin: 15 }],
    })
    expect(r.success).toBe(false)
  })

  it('rejects a schedule slot durationMin above maxDurationMin', () => {
    const r = createActivitySchema.safeParse({
      ...baseValid,
      minDurationMin: 30,
      maxDurationMin: 60,
      schedule: [{ day: 1, startMinutes: 540, durationMin: 90 }],
    })
    expect(r.success).toBe(false)
  })

  it('rejects an empty title', () => {
    const r = createActivitySchema.safeParse({ ...baseValid, title: '' })
    expect(r.success).toBe(false)
  })

  it('rejects weeklyTargetSessions below 1', () => {
    const r = createActivitySchema.safeParse({ ...baseValid, weeklyTargetSessions: 0 })
    expect(r.success).toBe(false)
  })

  it('accepts a valid IANA timeZone', () => {
    const r = createActivitySchema.safeParse({ ...baseValid, timeZone: 'America/New_York' })
    expect(r.success).toBe(true)
  })

  it('rejects a garbage timeZone', () => {
    const r = createActivitySchema.safeParse({ ...baseValid, timeZone: 'Not/AZone' })
    expect(r.success).toBe(false)
  })

  it('accepts an omitted timeZone', () => {
    const r = createActivitySchema.safeParse(baseValid)
    expect(r.success).toBe(true)
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

  it('rejects a schedule slot outside supplied bounds', () => {
    const r = updateActivitySchema.safeParse({
      id: crypto.randomUUID(),
      minDurationMin: 30,
      maxDurationMin: 60,
      schedule: [{ day: 1, startMinutes: 540, durationMin: 90 }],
    })
    expect(r.success).toBe(false)
  })

  it('accepts a schedule update without touching duration bounds', () => {
    const r = updateActivitySchema.safeParse({
      id: crypto.randomUUID(),
      schedule: [{ day: 2, startMinutes: 600, durationMin: 45 }],
    })
    expect(r.success).toBe(true)
  })

  it('accepts a valid IANA timeZone', () => {
    const r = updateActivitySchema.safeParse({
      id: crypto.randomUUID(),
      timeZone: 'Europe/London',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a garbage timeZone', () => {
    const r = updateActivitySchema.safeParse({
      id: crypto.randomUUID(),
      timeZone: 'Middle/Earth',
    })
    expect(r.success).toBe(false)
  })

  it('accepts an omitted timeZone', () => {
    const r = updateActivitySchema.safeParse({ id: crypto.randomUUID() })
    expect(r.success).toBe(true)
  })
})
