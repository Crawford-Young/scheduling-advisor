import { computeGroupStreak } from '@/lib/streaks'

const NOW = new Date('2026-07-08T20:00:00Z') // Wed
const occ = (iso: string, status: string) => ({ startAt: new Date(iso), status })

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
