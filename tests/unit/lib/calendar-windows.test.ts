import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import {
  resolveDayWindows,
  DEFAULT_WAKE_MINUTES,
  DEFAULT_SLEEP_MINUTES,
} from '@/lib/calendar-windows'

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}))

describe('resolveDayWindows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 7 default windows in minutes when prefs is null', () => {
    const result = resolveDayWindows(null)

    expect(DEFAULT_WAKE_MINUTES).toBe(540)
    expect(DEFAULT_SLEEP_MINUTES).toBe(1020)
    expect(result).toHaveLength(7)
    expect(result).toEqual(
      Array.from({ length: 7 }, () => ({
        wake: DEFAULT_WAKE_MINUTES,
        sleep: DEFAULT_SLEEP_MINUTES,
      })),
    )
  })

  it('returns 7 global windows when dayOverrides is null', () => {
    const result = resolveDayWindows({
      workingHoursStart: 8,
      workingHoursEnd: 18,
      dayOverrides: null,
    })

    expect(result).toHaveLength(7)
    expect(result).toEqual(Array.from({ length: 7 }, () => ({ wake: 8, sleep: 18 })))
  })

  it('returns 7 global windows when dayOverrides is undefined', () => {
    const result = resolveDayWindows({
      workingHoursStart: 8,
      workingHoursEnd: 18,
      dayOverrides: undefined,
    })

    expect(result).toHaveLength(7)
    expect(result).toEqual(Array.from({ length: 7 }, () => ({ wake: 8, sleep: 18 })))
  })

  it('merges a partial override into only the matching day (Monday)', () => {
    const result = resolveDayWindows({
      workingHoursStart: 8,
      workingHoursEnd: 18,
      dayOverrides: { '1': { wake: 6, sleep: 17 } },
    })

    expect(result).toHaveLength(7)
    // Sunday (0) unaffected
    expect(result[0]).toEqual({ wake: 8, sleep: 18 })
    // Monday (1) overridden
    expect(result[1]).toEqual({ wake: 6, sleep: 17 })
    // rest unaffected
    expect(result[2]).toEqual({ wake: 8, sleep: 18 })
    expect(result[3]).toEqual({ wake: 8, sleep: 18 })
    expect(result[4]).toEqual({ wake: 8, sleep: 18 })
    expect(result[5]).toEqual({ wake: 8, sleep: 18 })
    expect(result[6]).toEqual({ wake: 8, sleep: 18 })
  })

  it('applies a full 7-key override across every day', () => {
    const dayOverrides = {
      '0': { wake: 10, sleep: 20 },
      '1': { wake: 6, sleep: 17 },
      '2': { wake: 7, sleep: 18 },
      '3': { wake: 8, sleep: 19 },
      '4': { wake: 9, sleep: 20 },
      '5': { wake: 5, sleep: 15 },
      '6': { wake: 11, sleep: 21 },
    }

    const result = resolveDayWindows({
      workingHoursStart: 9,
      workingHoursEnd: 17,
      dayOverrides,
    })

    expect(result).toHaveLength(7)
    expect(result).toEqual([
      { wake: 10, sleep: 20 },
      { wake: 6, sleep: 17 },
      { wake: 7, sleep: 18 },
      { wake: 8, sleep: 19 },
      { wake: 9, sleep: 20 },
      { wake: 5, sleep: 15 },
      { wake: 11, sleep: 21 },
    ])
  })

  it('falls back to global defaults and reports to Sentry once when dayOverrides is a corrupt string', () => {
    const result = resolveDayWindows({
      workingHoursStart: 8,
      workingHoursEnd: 18,
      dayOverrides: 'garbage',
    })

    expect(result).toHaveLength(7)
    expect(result).toEqual(Array.from({ length: 7 }, () => ({ wake: 8, sleep: 18 })))
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('corrupt calendar dayOverrides'),
    )
  })

  it('falls back to global defaults and reports to Sentry once when a day entry has an invalid value', () => {
    const result = resolveDayWindows({
      workingHoursStart: 8,
      workingHoursEnd: 18,
      dayOverrides: { '1': { wake: 'x', sleep: 17 } },
    })

    expect(result).toHaveLength(7)
    expect(result).toEqual(Array.from({ length: 7 }, () => ({ wake: 8, sleep: 18 })))
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
  })

  it('always returns a length-7 result regardless of input shape', () => {
    expect(resolveDayWindows(null)).toHaveLength(7)
    expect(
      resolveDayWindows({ workingHoursStart: 0, workingHoursEnd: 24, dayOverrides: {} }),
    ).toHaveLength(7)
    expect(
      resolveDayWindows({ workingHoursStart: 0, workingHoursEnd: 24, dayOverrides: 42 }),
    ).toHaveLength(7)
  })
})
