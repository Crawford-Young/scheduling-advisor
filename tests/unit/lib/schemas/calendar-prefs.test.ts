import { describe, it, expect } from 'vitest'
import {
  dayOverridesSchema,
  updateWakeSleepSchema,
  updateCalendarPrefsSchema,
} from '@/lib/schemas/calendar-prefs'

describe('dayOverridesSchema (minutes-since-midnight)', () => {
  it('accepts an empty object', () => {
    const result = dayOverridesSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts a single day override in minutes', () => {
    const result = dayOverridesSchema.safeParse({ '1': { wake: 360, sleep: 1020 } })
    expect(result.success).toBe(true)
  })

  it('accepts a sleep value of exactly 1440 (midnight end)', () => {
    const result = dayOverridesSchema.safeParse({ '1': { wake: 0, sleep: 1440 } })
    expect(result.success).toBe(true)
  })

  it('rejects sleep less than or equal to wake', () => {
    const result = dayOverridesSchema.safeParse({ '1': { wake: 600, sleep: 600 } })
    expect(result.success).toBe(false)
  })

  it('rejects wake of 1440 (out of range)', () => {
    const result = dayOverridesSchema.safeParse({ '1': { wake: 1440, sleep: 1440 } })
    expect(result.success).toBe(false)
  })

  it('rejects sleep greater than 1440', () => {
    const result = dayOverridesSchema.safeParse({ '1': { wake: 0, sleep: 1441 } })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid day key', () => {
    const result = dayOverridesSchema.safeParse({ '7': { wake: 360, sleep: 1020 } })
    expect(result.success).toBe(false)
  })

  it('rejects a non-integer wake value', () => {
    const result = dayOverridesSchema.safeParse({ '1': { wake: 360.5, sleep: 1020 } })
    expect(result.success).toBe(false)
  })
})

describe('updateWakeSleepSchema (minutes-since-midnight)', () => {
  it('accepts a plain payload without new fields (back-compat)', () => {
    const result = updateWakeSleepSchema.safeParse({
      workingHoursStart: 540,
      workingHoursEnd: 1020,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a full payload with dayOverrides, use24h and ttlDays', () => {
    const result = updateWakeSleepSchema.safeParse({
      workingHoursStart: 540,
      workingHoursEnd: 1020,
      dayOverrides: { '1': { wake: 360, sleep: 1020 } },
      use24h: true,
      ttlDays: 30,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a null ttlDays (TTL disabled)', () => {
    const result = updateWakeSleepSchema.safeParse({
      workingHoursStart: 540,
      workingHoursEnd: 1020,
      ttlDays: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects ttlDays below 1', () => {
    const result = updateWakeSleepSchema.safeParse({
      workingHoursStart: 540,
      workingHoursEnd: 1020,
      ttlDays: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects ttlDays above 365', () => {
    const result = updateWakeSleepSchema.safeParse({
      workingHoursStart: 540,
      workingHoursEnd: 1020,
      ttlDays: 366,
    })
    expect(result.success).toBe(false)
  })

  it('accepts an end of exactly 1440 and a start of 0', () => {
    const result = updateWakeSleepSchema.safeParse({ workingHoursStart: 0, workingHoursEnd: 1440 })
    expect(result.success).toBe(true)
  })

  it('rejects workingHoursEnd greater than 1440', () => {
    const result = updateWakeSleepSchema.safeParse({
      workingHoursStart: 540,
      workingHoursEnd: 1441,
    })
    expect(result.success).toBe(false)
  })

  it('still rejects workingHoursEnd not after workingHoursStart', () => {
    const result = updateWakeSleepSchema.safeParse({
      workingHoursStart: 1020,
      workingHoursEnd: 540,
    })
    expect(result.success).toBe(false)
  })

  it('accepts a payload with defaultVisibility', () => {
    const result = updateWakeSleepSchema.safeParse({
      workingHoursStart: 540,
      workingHoursEnd: 1020,
      defaultVisibility: 'busy',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid defaultVisibility value', () => {
    const result = updateWakeSleepSchema.safeParse({
      workingHoursStart: 540,
      workingHoursEnd: 1020,
      defaultVisibility: 'friends',
    })
    expect(result.success).toBe(false)
  })
})

describe('updateCalendarPrefsSchema (minutes-since-midnight)', () => {
  it('accepts a minutes-based payload', () => {
    const result = updateCalendarPrefsSchema.safeParse({
      workingHoursStart: 480,
      workingHoursEnd: 1080,
      maxDailyTaskMinutes: 120,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a start of 0 and an end of 1440', () => {
    const result = updateCalendarPrefsSchema.safeParse({
      workingHoursStart: 0,
      workingHoursEnd: 1440,
      maxDailyTaskMinutes: 120,
    })
    expect(result.success).toBe(true)
  })

  it('rejects workingHoursEnd greater than 1440', () => {
    const result = updateCalendarPrefsSchema.safeParse({
      workingHoursStart: 480,
      workingHoursEnd: 1441,
      maxDailyTaskMinutes: 120,
    })
    expect(result.success).toBe(false)
  })

  it('rejects workingHoursEnd not after workingHoursStart', () => {
    const result = updateCalendarPrefsSchema.safeParse({
      workingHoursStart: 1080,
      workingHoursEnd: 480,
      maxDailyTaskMinutes: 120,
    })
    expect(result.success).toBe(false)
  })
})
