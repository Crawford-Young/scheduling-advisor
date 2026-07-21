import { describe, expect, it } from 'vitest'
import { formatPatternLabel } from '@/lib/pattern-label'
import type { ActivityScheduleSlot } from '@/lib/schemas/activity'

function slot(
  day: ActivityScheduleSlot['day'],
  startMinutes = 420,
  durationMin = 45,
): ActivityScheduleSlot {
  return { day, startMinutes, durationMin }
}

describe('formatPatternLabel', () => {
  it('returns "No schedule" for an empty schedule', () => {
    expect(formatPatternLabel([])).toBe('No schedule')
  })

  it('labels a single-slot schedule with a 1×/wk frequency', () => {
    expect(formatPatternLabel([slot(1)])).toBe('Mon · 1×/wk')
  })

  it('labels Mon/Wed/Fri as "Mon/Wed/Fri · 3×/wk"', () => {
    expect(formatPatternLabel([slot(1), slot(3), slot(5)])).toBe('Mon/Wed/Fri · 3×/wk')
  })

  it('orders days Sunday-first regardless of input order', () => {
    expect(formatPatternLabel([slot(5), slot(1), slot(3)])).toBe('Mon/Wed/Fri · 3×/wk')
  })

  it('maps Sunday (0) and Saturday (6) to their short names', () => {
    expect(formatPatternLabel([slot(0), slot(6)])).toBe('Sun/Sat · 2×/wk')
  })

  it('counts every slot as a session but lists each day once', () => {
    // Two Monday sessions (morning + evening) → one "Mon" but 2×/wk.
    expect(formatPatternLabel([slot(1, 420), slot(1, 1080)])).toBe('Mon · 2×/wk')
  })

  it('renders all seven weekday short names in order', () => {
    const everyDay: ActivityScheduleSlot[] = [0, 1, 2, 3, 4, 5, 6].map((d) =>
      slot(d as ActivityScheduleSlot['day']),
    )
    expect(formatPatternLabel(everyDay)).toBe('Sun/Mon/Tue/Wed/Thu/Fri/Sat · 7×/wk')
  })
})
