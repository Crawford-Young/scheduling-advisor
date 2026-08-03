import {
  expandOccurrencesInWeek,
  weekdayTokensForWeekly,
  type WeekOccurrence,
} from './proposal-week-occurrences'

describe('weekdayTokensForWeekly', () => {
  it('returns the explicit recurrenceDays unchanged when non-empty', () => {
    const anchorStart = new Date(2026, 7, 3) // Monday
    expect(weekdayTokensForWeekly(['Mon', 'Wed', 'Fri'], anchorStart)).toEqual([
      'Mon',
      'Wed',
      'Fri',
    ])
  })

  it('falls back to the anchor weekday when recurrenceDays is undefined', () => {
    const anchorStart = new Date(2026, 7, 3) // Monday
    expect(weekdayTokensForWeekly(undefined, anchorStart)).toEqual(['Mon'])
  })

  it('falls back to the anchor weekday when recurrenceDays is empty', () => {
    const anchorStart = new Date(2026, 7, 1) // Saturday
    expect(weekdayTokensForWeekly([], anchorStart)).toEqual(['Sat'])
  })
})

describe('expandOccurrencesInWeek', () => {
  it('no recurrence returns the anchor date only', () => {
    expect(expandOccurrencesInWeek('2026-08-03', undefined, undefined, undefined)).toEqual([
      { date: '2026-08-03', isAnchor: true },
    ])
  })

  it('daily, unbounded, expands from the anchor through Saturday of that week', () => {
    // 2026-08-03 is a Monday; its local week runs 2026-08-02 (Sun)–2026-08-08 (Sat).
    expect(expandOccurrencesInWeek('2026-08-03', 'daily', undefined, undefined)).toEqual([
      { date: '2026-08-03', isAnchor: true },
      { date: '2026-08-04', isAnchor: false },
      { date: '2026-08-05', isAnchor: false },
      { date: '2026-08-06', isAnchor: false },
      { date: '2026-08-07', isAnchor: false },
      { date: '2026-08-08', isAnchor: false },
    ])
  })

  it('daily, count-bounded, stops at the computed until date mid-week', () => {
    // recurrenceCount=3 -> until = anchor + 2 days = 2026-08-05.
    expect(expandOccurrencesInWeek('2026-08-03', 'daily', undefined, 3)).toEqual([
      { date: '2026-08-03', isAnchor: true },
      { date: '2026-08-04', isAnchor: false },
      { date: '2026-08-05', isAnchor: false },
    ])
  })

  it('weekly with explicit recurrenceDays expands only those weekdays, never before the anchor', () => {
    // Sun (before the Mon anchor) is excluded even though it is in recurrenceDays.
    expect(
      expandOccurrencesInWeek('2026-08-03', 'weekly', ['Sun', 'Mon', 'Wed', 'Fri'], undefined),
    ).toEqual([
      { date: '2026-08-03', isAnchor: true },
      { date: '2026-08-05', isAnchor: false },
      { date: '2026-08-07', isAnchor: false },
    ])
  })

  it('weekly without recurrenceDays falls back to the anchor weekday only (parity with the card fallback)', () => {
    expect(expandOccurrencesInWeek('2026-08-03', 'weekly', undefined, undefined)).toEqual([
      { date: '2026-08-03', isAnchor: true },
    ])
  })

  it('monthly returns the anchor only, ignoring recurrenceCount', () => {
    expect(expandOccurrencesInWeek('2026-08-03', 'monthly', undefined, 6)).toEqual([
      { date: '2026-08-03', isAnchor: true },
    ])
  })

  it('a Saturday anchor yields a single occurrence under every frequency', () => {
    const anchor = '2026-08-01' // Saturday, the last day of its own local week.
    const expected: readonly WeekOccurrence[] = [{ date: anchor, isAnchor: true }]
    expect(expandOccurrencesInWeek(anchor, undefined, undefined, undefined)).toEqual(expected)
    expect(expandOccurrencesInWeek(anchor, 'daily', undefined, undefined)).toEqual(expected)
    expect(expandOccurrencesInWeek(anchor, 'weekly', undefined, undefined)).toEqual(expected)
    expect(expandOccurrencesInWeek(anchor, 'monthly', undefined, undefined)).toEqual(expected)
  })

  it('a DST-boundary week (US spring-forward, 2026-03-08) still yields exactly 7 daily occurrences', () => {
    // 2026-03-08 is a Sunday and the local week's first day, so the full week
    // spans it; the transition falls at 2am local on this day and must not
    // perturb date-only (midnight, no time component) calendar arithmetic.
    const result = expandOccurrencesInWeek('2026-03-08', 'daily', undefined, undefined)
    expect(result).toHaveLength(7)
    expect(result[0]).toEqual({ date: '2026-03-08', isAnchor: true })
    expect(result[6]).toEqual({ date: '2026-03-14', isAnchor: false })
  })
})
