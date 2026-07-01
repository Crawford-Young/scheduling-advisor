import { describe, it, expect } from 'vitest'
import { dayOverridesSchema, updateWakeSleepSchema } from '@/lib/schemas/calendar-prefs'

describe('dayOverridesSchema', () => {
  it('accepts an empty object', () => {
    const result = dayOverridesSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts a single day override', () => {
    const result = dayOverridesSchema.safeParse({ '1': { wake: 6, sleep: 17 } })
    expect(result.success).toBe(true)
  })

  it('rejects sleep less than or equal to wake', () => {
    const result = dayOverridesSchema.safeParse({ '1': { wake: 10, sleep: 10 } })
    expect(result.success).toBe(false)
  })

  it('rejects wake of 24', () => {
    const result = dayOverridesSchema.safeParse({ '1': { wake: 24, sleep: 24 } })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid day key', () => {
    const result = dayOverridesSchema.safeParse({ '7': { wake: 6, sleep: 17 } })
    expect(result.success).toBe(false)
  })

  it('rejects a non-integer wake value', () => {
    const result = dayOverridesSchema.safeParse({ '1': { wake: 6.5, sleep: 17 } })
    expect(result.success).toBe(false)
  })
})

describe('updateWakeSleepSchema', () => {
  it('accepts a plain payload without new fields (back-compat)', () => {
    const result = updateWakeSleepSchema.safeParse({ workingHoursStart: 9, workingHoursEnd: 17 })
    expect(result.success).toBe(true)
  })

  it('accepts a full payload with dayOverrides and use24h', () => {
    const result = updateWakeSleepSchema.safeParse({
      workingHoursStart: 9,
      workingHoursEnd: 17,
      dayOverrides: { '1': { wake: 6, sleep: 17 } },
      use24h: true,
    })
    expect(result.success).toBe(true)
  })

  it('still rejects workingHoursEnd not after workingHoursStart', () => {
    const result = updateWakeSleepSchema.safeParse({ workingHoursStart: 17, workingHoursEnd: 9 })
    expect(result.success).toBe(false)
  })
})
