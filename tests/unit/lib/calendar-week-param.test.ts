import { describe, expect, it } from 'vitest'
import { resolveWeekStart, weekParamFromDate } from '@/lib/calendar-week-param'

/** Mirrors the module's own Monday-of-current-week fallback, in local time. */
function expectedFallbackWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

describe('resolveWeekStart', () => {
  it('passes a valid YYYY-MM-DD value through unchanged', () => {
    expect(resolveWeekStart('2026-06-01')).toBe('2026-06-01')
  })

  it('falls back to the current week start when the param is absent', () => {
    expect(resolveWeekStart(undefined)).toBe(expectedFallbackWeekStart())
  })

  it('falls back to the current week start for a malformed value', () => {
    expect(resolveWeekStart('garbage')).toBe(expectedFallbackWeekStart())
  })

  it('falls back to the current week start for a non-existent calendar date', () => {
    expect(resolveWeekStart('2026-13-99')).toBe(expectedFallbackWeekStart())
  })
})

describe('weekParamFromDate', () => {
  it('formats a date as local YYYY-MM-DD with zero padding', () => {
    expect(weekParamFromDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })

  it('uses local getters, not UTC substrings', () => {
    const lateEvening = new Date(2026, 6, 22, 23, 45)
    expect(weekParamFromDate(lateEvening)).toBe('2026-07-22')
  })
})
