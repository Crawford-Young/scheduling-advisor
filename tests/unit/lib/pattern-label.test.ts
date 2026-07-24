import { describe, expect, it } from 'vitest'
import { formatSeriesLabel, type SeriesLabelInput } from '@/lib/pattern-label'

const LAST_NTH_ORDINAL = -1

function series(over: Partial<SeriesLabelInput> = {}): SeriesLabelInput {
  return {
    freq: 'weekly',
    weekdays: [1],
    dayOfMonth: null,
    nthOrdinal: null,
    nthWeekday: null,
    month: null,
    startMinutes: 540, // 9:00 AM
    durationMin: 30,
    until: null,
    ...over,
  }
}

describe('formatSeriesLabel', () => {
  describe('weekly', () => {
    it('labels a single weekday with 12h time and duration', () => {
      expect(formatSeriesLabel(series({ weekdays: [1] }), false)).toBe('Mon · 9:00 AM · 30m')
    })

    it('collapses a non-contiguous weekday set with "/"', () => {
      expect(formatSeriesLabel(series({ weekdays: [1, 3, 5] }), false)).toBe(
        'Mon/Wed/Fri · 9:00 AM · 30m',
      )
    })

    it('collapses a contiguous 5-day run into a range (Mon–Fri)', () => {
      expect(formatSeriesLabel(series({ weekdays: [1, 2, 3, 4, 5] }), false)).toBe(
        'Mon–Fri · 9:00 AM · 30m',
      )
    })

    it('does not collapse a 2-day contiguous run', () => {
      expect(formatSeriesLabel(series({ weekdays: [1, 2] }), false)).toBe('Mon/Tue · 9:00 AM · 30m')
    })

    it('collapses a full Sun-Sat week into one range', () => {
      expect(formatSeriesLabel(series({ weekdays: [0, 1, 2, 3, 4, 5, 6] }), false)).toBe(
        'Sun–Sat · 9:00 AM · 30m',
      )
    })

    it('mixes a collapsed range with a separate single day', () => {
      expect(formatSeriesLabel(series({ weekdays: [1, 2, 3, 5] }), false)).toBe(
        'Mon–Wed/Fri · 9:00 AM · 30m',
      )
    })

    it('sorts unordered weekday input before collapsing', () => {
      expect(formatSeriesLabel(series({ weekdays: [5, 1, 3] }), false)).toBe(
        'Mon/Wed/Fri · 9:00 AM · 30m',
      )
    })
  })

  describe('daily', () => {
    it('labels daily with no duration, 24h time', () => {
      expect(formatSeriesLabel(series({ freq: 'daily', startMinutes: 420 }), true)).toBe(
        'Daily · 7:00',
      )
    })

    it('labels daily with 12h time', () => {
      expect(formatSeriesLabel(series({ freq: 'daily', startMinutes: 420 }), false)).toBe(
        'Daily · 7:00 AM',
      )
    })
  })

  describe('time formatting', () => {
    it('renders 24h format with an unpadded hour (18:00)', () => {
      expect(formatSeriesLabel(series({ freq: 'daily', startMinutes: 18 * 60 }), true)).toBe(
        'Daily · 18:00',
      )
    })

    it('renders 12h midnight as 12:00 AM', () => {
      expect(formatSeriesLabel(series({ freq: 'daily', startMinutes: 0 }), false)).toBe(
        'Daily · 12:00 AM',
      )
    })

    it('renders 12h noon as 12:00 PM', () => {
      expect(formatSeriesLabel(series({ freq: 'daily', startMinutes: 720 }), false)).toBe(
        'Daily · 12:00 PM',
      )
    })

    it('renders a 12h afternoon hour correctly (13:00 -> 1:00 PM)', () => {
      expect(formatSeriesLabel(series({ freq: 'daily', startMinutes: 13 * 60 }), false)).toBe(
        'Daily · 1:00 PM',
      )
    })

    it('pads single-digit minutes', () => {
      expect(formatSeriesLabel(series({ freq: 'daily', startMinutes: 9 * 60 + 5 }), true)).toBe(
        'Daily · 9:05',
      )
    })
  })

  describe('monthly nth-weekday mode', () => {
    it('labels "3rd Thu monthly" with 24h time and duration', () => {
      expect(
        formatSeriesLabel(
          series({
            freq: 'monthly',
            weekdays: null,
            nthOrdinal: 3,
            nthWeekday: 4,
            startMinutes: 18 * 60,
            durationMin: 60,
          }),
          true,
        ),
      ).toBe('3rd Thu monthly · 18:00 · 60m')
    })

    it('labels ordinal 1 as "1st"', () => {
      expect(
        formatSeriesLabel(
          series({ freq: 'monthly', weekdays: null, nthOrdinal: 1, nthWeekday: 1 }),
          true,
        ),
      ).toContain('1st Mon monthly')
    })

    it('labels ordinal 2 as "2nd"', () => {
      expect(
        formatSeriesLabel(
          series({ freq: 'monthly', weekdays: null, nthOrdinal: 2, nthWeekday: 2 }),
          true,
        ),
      ).toContain('2nd Tue monthly')
    })

    it('labels ordinal 4 as "4th"', () => {
      expect(
        formatSeriesLabel(
          series({ freq: 'monthly', weekdays: null, nthOrdinal: 4, nthWeekday: 6 }),
          true,
        ),
      ).toContain('4th Sat monthly')
    })

    it('labels the "last" ordinal (-1) as "Last"', () => {
      expect(
        formatSeriesLabel(
          series({
            freq: 'monthly',
            weekdays: null,
            nthOrdinal: LAST_NTH_ORDINAL,
            nthWeekday: 0,
          }),
          true,
        ),
      ).toBe('Last Sun monthly · 9:00 · 30m')
    })
  })

  describe('monthly day-of-month mode', () => {
    it('labels day 1 with "st" suffix', () => {
      expect(
        formatSeriesLabel(series({ freq: 'monthly', weekdays: null, dayOfMonth: 1 }), false),
      ).toBe('Monthly on the 1st · 9:00 AM · 30m')
    })

    it('labels day 2 with "nd" suffix', () => {
      expect(
        formatSeriesLabel(series({ freq: 'monthly', weekdays: null, dayOfMonth: 2 }), false),
      ).toContain('2nd')
    })

    it('labels day 3 with "rd" suffix', () => {
      expect(
        formatSeriesLabel(series({ freq: 'monthly', weekdays: null, dayOfMonth: 3 }), false),
      ).toContain('3rd')
    })

    it('labels day 4 with "th" suffix', () => {
      expect(
        formatSeriesLabel(series({ freq: 'monthly', weekdays: null, dayOfMonth: 4 }), false),
      ).toContain('4th')
    })

    it('labels the 11th-13th teens with "th" (not "st"/"nd"/"rd")', () => {
      expect(
        formatSeriesLabel(series({ freq: 'monthly', weekdays: null, dayOfMonth: 11 }), false),
      ).toContain('11th')
      expect(
        formatSeriesLabel(series({ freq: 'monthly', weekdays: null, dayOfMonth: 12 }), false),
      ).toContain('12th')
      expect(
        formatSeriesLabel(series({ freq: 'monthly', weekdays: null, dayOfMonth: 13 }), false),
      ).toContain('13th')
    })

    it('labels day 21 with "st" suffix (not "th")', () => {
      expect(
        formatSeriesLabel(series({ freq: 'monthly', weekdays: null, dayOfMonth: 21 }), false),
      ).toContain('21st')
    })

    it('labels day 31 with "st" suffix', () => {
      expect(
        formatSeriesLabel(series({ freq: 'monthly', weekdays: null, dayOfMonth: 31 }), false),
      ).toContain('31st')
    })
  })

  describe('yearly', () => {
    it('labels "Every year on Mar 5"', () => {
      expect(
        formatSeriesLabel(
          series({
            freq: 'yearly',
            weekdays: null,
            month: 3,
            dayOfMonth: 5,
            startMinutes: 540,
            durationMin: 45,
          }),
          false,
        ),
      ).toBe('Every year on Mar 5 · 9:00 AM · 45m')
    })

    it('labels December correctly', () => {
      expect(
        formatSeriesLabel(
          series({ freq: 'yearly', weekdays: null, month: 12, dayOfMonth: 25 }),
          false,
        ),
      ).toContain('Every year on Dec 25')
    })
  })

  describe('ends-on suffix', () => {
    it('appends " · ends <M/D/YYYY>" when until is set', () => {
      expect(formatSeriesLabel(series({ until: new Date(2026, 7, 1) }), false)).toBe(
        'Mon · 9:00 AM · 30m · ends 8/1/2026',
      )
    })

    it('omits the ends suffix when until is null', () => {
      expect(formatSeriesLabel(series({ until: null }), false)).not.toContain('ends')
    })

    it('reads the ends date via local getters (not UTC)', () => {
      // A late-night local date whose UTC day would differ if UTC substrings were used.
      const until = new Date(2026, 0, 5, 23, 30)
      expect(formatSeriesLabel(series({ until }), false)).toContain('ends 1/5/2026')
    })
  })
})
