import { expandProposalOccurrences, type ProposalInput } from '@/lib/chat/proposal-occurrences'

/** Local wall-clock parts of an ISO instant — TZ-independent assertions. */
function local(iso: string): {
  y: number
  mo: number
  d: number
  h: number
  min: number
} {
  const dt = new Date(iso)
  return {
    y: dt.getFullYear(),
    mo: dt.getMonth(),
    d: dt.getDate(),
    h: dt.getHours(),
    min: dt.getMinutes(),
  }
}

const base: ProposalInput = {
  title: 'Gym',
  date: '2026-07-20', // Monday
  start: '09:00',
  end: '10:00',
}

describe('expandProposalOccurrences', () => {
  it('returns a single occurrence for a non-recurring proposal', () => {
    const out = expandProposalOccurrences(base)
    expect(out).toHaveLength(1)
    const s = local(out[0]!.startAt)
    expect([s.y, s.mo, s.d, s.h, s.min]).toEqual([2026, 6, 20, 9, 0])
    const e = local(out[0]!.endAt)
    expect([e.h, e.min]).toEqual([10, 0])
    expect(out[0]!.title).toBe('Gym')
  })

  it('carries the description onto every occurrence', () => {
    const out = expandProposalOccurrences({ ...base, description: 'leg day' })
    expect(out[0]!.description).toBe('leg day')
  })

  it('fans a daily recurrence into consecutive days', () => {
    const out = expandProposalOccurrences({
      ...base,
      recurrence: 'daily',
      recurrenceCount: 3,
    })
    expect(out).toHaveLength(3)
    expect(out.map((o) => local(o.startAt).d)).toEqual([20, 21, 22])
    // time preserved
    out.forEach((o) => expect(local(o.startAt).h).toBe(9))
  })

  it('fans a monthly recurrence by calendar month', () => {
    const out = expandProposalOccurrences({
      ...base,
      recurrence: 'monthly',
      recurrenceCount: 3,
    })
    expect(out).toHaveLength(3)
    expect(out.map((o) => local(o.startAt).mo)).toEqual([6, 7, 8])
    out.forEach((o) => expect(local(o.startAt).d).toBe(20))
  })

  it('fans a weekly interval (no weekday list) by 7-day steps', () => {
    const out = expandProposalOccurrences({
      ...base,
      recurrence: 'weekly',
      recurrenceCount: 2,
    })
    expect(out).toHaveLength(2)
    expect(out.map((o) => local(o.startAt).d)).toEqual([20, 27])
  })

  it('fans weekly weekday tokens across the requested number of weeks', () => {
    const out = expandProposalOccurrences({
      ...base,
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Wed', 'Fri'],
      recurrenceCount: 2,
    })
    // 3 weekdays × 2 weeks
    expect(out).toHaveLength(6)
    // Week 1: Mon 20, Wed 22, Fri 24; Week 2: Mon 27, Wed 29, Fri 31
    expect(out.map((o) => local(o.startAt).d)).toEqual([20, 22, 24, 27, 29, 31])
  })

  it('defaults a weekday pattern with no count to a single week', () => {
    const out = expandProposalOccurrences({
      ...base,
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Wed'],
    })
    expect(out).toHaveLength(2)
    expect(out.map((o) => local(o.startAt).d)).toEqual([20, 22])
  })

  it('anchors weekday tokens to the anchor week even when earlier than the anchor day', () => {
    // anchor is Monday the 20th; Sun is earlier in the same week (19th)
    const out = expandProposalOccurrences({
      ...base,
      recurrence: 'weekly',
      recurrenceDays: ['Sun', 'Tue'],
    })
    expect(out.map((o) => local(o.startAt).d)).toEqual([19, 21])
  })
})
