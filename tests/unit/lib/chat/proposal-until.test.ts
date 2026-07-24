import { computeUntilFromCount } from '@/lib/chat/proposal-until'

describe('computeUntilFromCount', () => {
  describe('daily', () => {
    it('count=1 is an identity — returns the anchor date', () => {
      expect(computeUntilFromCount('2026-08-03', 'daily', 1)).toBe('2026-08-03')
    })

    it('steps count-1 calendar days from the anchor', () => {
      // 2026-08-03 + 3 days = 2026-08-06
      expect(computeUntilFromCount('2026-08-03', 'daily', 4)).toBe('2026-08-06')
    })

    it('crosses a month boundary', () => {
      // 2026-08-30 + 4 days = 2026-09-03
      expect(computeUntilFromCount('2026-08-30', 'daily', 5)).toBe('2026-09-03')
    })
  })

  describe('weekly', () => {
    it('count=1 covers exactly one week (anchor + 6 days), not the anchor itself', () => {
      // count is a WEEK count (weeks × selected weekdays), so 1 week still spans
      // 7 calendar days ending 6 days after the anchor.
      expect(computeUntilFromCount('2026-08-03', 'weekly', 1)).toBe('2026-08-09')
    })

    it('steps count*7-1 calendar days from the anchor', () => {
      // 2026-08-03 (Mon) + (8*7 - 1) = 55 days = 2026-09-27
      expect(computeUntilFromCount('2026-08-03', 'weekly', 8)).toBe('2026-09-27')
    })

    it('is exact calendar-date math across a DST-transition week (US fall-back, 2026-11-01)', () => {
      // Anchor the week before the US DST fall-back (2026-11-01). 2 weeks =
      // anchor + 13 days; the assertion is the exact calendar date regardless
      // of any host-timezone offset shift mid-span.
      expect(computeUntilFromCount('2026-10-26', 'weekly', 2)).toBe('2026-11-08')
    })
  })

  describe('monthly', () => {
    it('count=1 is an identity — returns the anchor date', () => {
      expect(computeUntilFromCount('2026-08-03', 'monthly', 1)).toBe('2026-08-03')
    })

    it('steps count-1 calendar months from the anchor', () => {
      expect(computeUntilFromCount('2026-08-03', 'monthly', 6)).toBe('2027-01-03')
    })

    it('clamps Jan 31 + 1 month to Feb 28 in a non-leap year', () => {
      expect(computeUntilFromCount('2027-01-31', 'monthly', 2)).toBe('2027-02-28')
    })

    it('clamps Jan 31 + 1 month to Feb 29 in a leap year', () => {
      expect(computeUntilFromCount('2028-01-31', 'monthly', 2)).toBe('2028-02-29')
    })
  })
})
