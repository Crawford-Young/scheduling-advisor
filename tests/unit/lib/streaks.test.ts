import { computeGroupStreak, computePerOccurrenceStreaks } from '@/lib/streaks'

const NOW = new Date('2026-07-08T20:00:00Z') // Wed
const occ = (iso: string, status: string) => ({ startAt: new Date(iso), status })
const idOcc = (id: string, iso: string | null, status: string, timeZone: string | null = null) => ({
  id,
  startAt: iso === null ? null : new Date(iso),
  status,
  timeZone,
})

describe('computeGroupStreak', () => {
  it('empty input → 0/0', () => {
    expect(computeGroupStreak([], NOW)).toEqual({ current: 0, best: 0 })
  })
  it('single due completed → 1/1', () => {
    expect(computeGroupStreak([occ('2026-07-06T10:00:00Z', 'completed')], NOW)).toEqual({
      current: 1,
      best: 1,
    })
  })
  it('chains across unscheduled gap days (Mon done, Wed done → 2)', () => {
    const r = computeGroupStreak(
      [occ('2026-07-06T10:00:00Z', 'completed'), occ('2026-07-08T10:00:00Z', 'completed')],
      NOW,
    )
    expect(r.current).toBe(2)
  })
  it('missed PAST occurrence breaks the chain', () => {
    const r = computeGroupStreak(
      [
        occ('2026-07-03T10:00:00Z', 'completed'),
        occ('2026-07-06T10:00:00Z', 'pending'),
        occ('2026-07-07T10:00:00Z', 'completed'),
      ],
      NOW,
    )
    expect(r.current).toBe(1)
  })
  it("today's pending occurrence is grace-skipped, chain intact", () => {
    const r = computeGroupStreak(
      [
        occ('2026-07-06T10:00:00Z', 'completed'),
        occ('2026-07-07T10:00:00Z', 'completed'),
        occ('2026-07-08T10:00:00Z', 'pending'),
      ],
      NOW,
    )
    expect(r.current).toBe(2)
  })
  it('future occurrences never count', () => {
    const r = computeGroupStreak(
      [occ('2026-07-07T10:00:00Z', 'completed'), occ('2026-07-10T10:00:00Z', 'completed')],
      NOW,
    )
    expect(r).toEqual({ current: 1, best: 1 })
  })
  it('best = longest run with mid-history break; current reflects tail only', () => {
    const r = computeGroupStreak(
      [
        occ('2026-06-29T10:00:00Z', 'completed'),
        occ('2026-06-30T10:00:00Z', 'completed'),
        occ('2026-07-01T10:00:00Z', 'completed'),
        occ('2026-07-02T10:00:00Z', 'pending'),
        occ('2026-07-06T10:00:00Z', 'completed'),
      ],
      NOW,
    )
    expect(r).toEqual({ current: 1, best: 3 })
  })
  it('best applies NO grace to today', () => {
    const r = computeGroupStreak(
      [occ('2026-07-07T10:00:00Z', 'completed'), occ('2026-07-08T10:00:00Z', 'pending')],
      NOW,
    )
    expect(r.best).toBe(1)
  })
  it('unordered input is sorted internally', () => {
    const r = computeGroupStreak(
      [occ('2026-07-08T10:00:00Z', 'completed'), occ('2026-07-06T10:00:00Z', 'completed')],
      NOW,
    )
    expect(r.current).toBe(2)
  })
  it('null startAt rows ignored', () => {
    const r = computeGroupStreak([{ startAt: null, status: 'completed' }], NOW)
    expect(r).toEqual({ current: 0, best: 0 })
  })
  it('in_progress treated as not completed (grace applies today only)', () => {
    const r = computeGroupStreak([occ('2026-07-06T10:00:00Z', 'in_progress')], NOW)
    expect(r).toEqual({ current: 0, best: 0 })
  })
})

describe('computePerOccurrenceStreaks', () => {
  it('all-completed ascending group → progressive values 1,2,3', () => {
    const occs = [
      idOcc('a', '2026-07-01T10:00:00Z', 'completed'),
      idOcc('b', '2026-07-02T10:00:00Z', 'completed'),
      idOcc('c', '2026-07-03T10:00:00Z', 'completed'),
    ]
    expect(computePerOccurrenceStreaks(occs, NOW)).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('past pending mid-chain resets to 0; later completed restarts at 1', () => {
    const occs = [
      idOcc('a', '2026-07-01T10:00:00Z', 'completed'),
      idOcc('b', '2026-07-02T10:00:00Z', 'pending'),
      idOcc('c', '2026-07-03T10:00:00Z', 'completed'),
    ]
    expect(computePerOccurrenceStreaks(occs, NOW)).toEqual({ a: 1, b: 0, c: 1 })
  })

  it("today's pending after 3 completed emits 0 without breaking the run (not done yet ≠ broken)", () => {
    const occs = [
      idOcc('a', '2026-07-05T10:00:00Z', 'completed'),
      idOcc('b', '2026-07-06T10:00:00Z', 'completed'),
      idOcc('c', '2026-07-07T10:00:00Z', 'completed'),
      idOcc('d', '2026-07-08T10:00:00Z', 'pending'), // today
      idOcc('e', '2026-07-09T10:00:00Z', 'completed'), // proves run wasn't reset by d
    ]
    expect(computePerOccurrenceStreaks(occs, NOW)).toEqual({ a: 1, b: 2, c: 3, d: 0, e: 4 })
  })

  it('future pendings after 3 completed all emit 0; a later completed continues the run undisturbed', () => {
    const occs = [
      idOcc('a', '2026-07-05T10:00:00Z', 'completed'),
      idOcc('b', '2026-07-06T10:00:00Z', 'completed'),
      idOcc('c', '2026-07-07T10:00:00Z', 'completed'),
      idOcc('d', '2026-07-09T10:00:00Z', 'pending'),
      idOcc('e', '2026-07-10T10:00:00Z', 'pending'),
      idOcc('f', '2026-07-11T10:00:00Z', 'pending'),
      idOcc('g', '2026-07-12T10:00:00Z', 'completed'),
    ]
    expect(computePerOccurrenceStreaks(occs, NOW)).toEqual({
      a: 1,
      b: 2,
      c: 3,
      d: 0,
      e: 0,
      f: 0,
      g: 4,
    })
  })

  it('null startAt → 0, excluded from the walk, does not disturb surrounding run', () => {
    const occs = [
      idOcc('a', '2026-07-05T10:00:00Z', 'completed'),
      idOcc('x', null, 'completed'),
      idOcc('b', '2026-07-06T10:00:00Z', 'completed'),
    ]
    expect(computePerOccurrenceStreaks(occs, NOW)).toEqual({ a: 1, x: 0, b: 2 })
  })

  it('in_progress past is treated as pending past (0 + chain reset)', () => {
    const occs = [
      idOcc('a', '2026-07-05T10:00:00Z', 'completed'),
      idOcc('b', '2026-07-06T10:00:00Z', 'in_progress'),
      idOcc('c', '2026-07-07T10:00:00Z', 'completed'),
    ]
    expect(computePerOccurrenceStreaks(occs, NOW)).toEqual({ a: 1, b: 0, c: 1 })
  })

  describe('TZ-aware day boundary (series time_zone, wave 2.6 S13)', () => {
    const TZ = 'America/New_York' // UTC-4 (EDT) in July

    it('an evening-Eastern occurrence whose UTC day equals "now"\'s UTC day but whose LOCAL day is yesterday resets the run', () => {
      // now: 2026-07-09T14:00:00Z = 10:00 AM Eastern, local day Jul 9.
      const zonedNow = new Date('2026-07-09T14:00:00Z')
      const occs = [
        idOcc('a', '2026-07-07T20:00:00Z', 'completed', TZ), // 4:00 PM Eastern, local Jul 7
        idOcc('b', '2026-07-08T20:00:00Z', 'completed', TZ), // 4:00 PM Eastern, local Jul 8
        // 00:30 UTC Jul 9 = 8:30 PM Eastern Jul 8 — UTC day is "today" (Jul 9),
        // but the LOCAL (series TZ) day is Jul 8, i.e. already past.
        idOcc('c', '2026-07-09T00:30:00Z', 'pending', TZ),
        idOcc('d', '2026-07-10T20:00:00Z', 'completed', TZ), // local Jul 10 — proves reset happened
      ]
      expect(computePerOccurrenceStreaks(occs, zonedNow)).toEqual({ a: 1, b: 2, c: 0, d: 1 })
    })

    it('the same UTC-day-boundary case does NOT reset under UTC fallback (null time_zone)', () => {
      const zonedNow = new Date('2026-07-09T14:00:00Z')
      const occs = [
        idOcc('a', '2026-07-07T20:00:00Z', 'completed'),
        idOcc('b', '2026-07-08T20:00:00Z', 'completed'),
        idOcc('c', '2026-07-09T00:30:00Z', 'pending'), // same UTC day as now → not past
        idOcc('d', '2026-07-10T20:00:00Z', 'completed'),
      ]
      expect(computePerOccurrenceStreaks(occs, zonedNow)).toEqual({ a: 1, b: 2, c: 0, d: 3 })
    })

    it('a same-local-day-as-now pending in the series TZ emits 0 without resetting the run', () => {
      // now local (Eastern): Jul 9, 10:00 AM.
      const zonedNow = new Date('2026-07-09T14:00:00Z')
      const occs = [
        idOcc('a', '2026-07-08T20:00:00Z', 'completed', TZ), // local Jul 8
        // 12:30 PM Eastern Jul 9 — same local day as now, i.e. "today", not past.
        idOcc('b', '2026-07-09T16:30:00Z', 'pending', TZ),
        idOcc('c', '2026-07-10T20:00:00Z', 'completed', TZ), // proves run survived b
      ]
      expect(computePerOccurrenceStreaks(occs, zonedNow)).toEqual({ a: 1, b: 0, c: 2 })
    })
  })
})
