import { computeGroupStreak, computePerOccurrenceStreaks } from '@/lib/streaks'

const NOW = new Date('2026-07-08T20:00:00Z') // Wed
const occ = (iso: string, status: string) => ({ startAt: new Date(iso), status })
const idOcc = (id: string, iso: string | null, status: string) => ({
  id,
  startAt: iso === null ? null : new Date(iso),
  status,
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

  it("today's pending after 3 completed shows 4 (grace + projection)", () => {
    const occs = [
      idOcc('a', '2026-07-05T10:00:00Z', 'completed'),
      idOcc('b', '2026-07-06T10:00:00Z', 'completed'),
      idOcc('c', '2026-07-07T10:00:00Z', 'completed'),
      idOcc('d', '2026-07-08T10:00:00Z', 'pending'),
    ]
    expect(computePerOccurrenceStreaks(occs, NOW)).toEqual({ a: 1, b: 2, c: 3, d: 4 })
  })

  it('future pendings after 3 completed project 4,5,6', () => {
    const occs = [
      idOcc('a', '2026-07-05T10:00:00Z', 'completed'),
      idOcc('b', '2026-07-06T10:00:00Z', 'completed'),
      idOcc('c', '2026-07-07T10:00:00Z', 'completed'),
      idOcc('d', '2026-07-09T10:00:00Z', 'pending'),
      idOcc('e', '2026-07-10T10:00:00Z', 'pending'),
      idOcc('f', '2026-07-11T10:00:00Z', 'pending'),
    ]
    expect(computePerOccurrenceStreaks(occs, NOW)).toEqual({
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
    })
  })

  it('completed occurrence dated after a future pending continues the projected run', () => {
    const occs = [
      idOcc('a', '2026-07-05T10:00:00Z', 'completed'),
      idOcc('b', '2026-07-06T10:00:00Z', 'completed'),
      idOcc('c', '2026-07-07T10:00:00Z', 'completed'),
      idOcc('d', '2026-07-09T10:00:00Z', 'pending'),
      idOcc('e', '2026-07-10T10:00:00Z', 'completed'),
    ]
    expect(computePerOccurrenceStreaks(occs, NOW)).toEqual({
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
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
})
