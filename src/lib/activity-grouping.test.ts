import { describe, expect, it } from 'vitest'
import { buildPatternLabel, collapseSeries, type GroupableTask } from '@/lib/activity-grouping'

const NOW = new Date('2026-07-14T18:00:00.000Z') // Tue Jul 14

function row(overrides: Partial<GroupableTask> & { id: string }): GroupableTask {
  return {
    status: 'pending',
    startAt: null,
    recurrence: null,
    recurrenceGroupId: null,
    recurrenceDays: null,
    timeZone: null,
    ...overrides,
  }
}

describe('buildPatternLabel', () => {
  it('returns empty string for null recurrence', () => {
    expect(buildPatternLabel(null, null)).toBe('')
  })
  it('capitalizes a bare frequency (legacy null days)', () => {
    expect(buildPatternLabel('daily', null)).toBe('Daily')
  })
  it('treats an empty day set like null', () => {
    expect(buildPatternLabel('weekly', [])).toBe('Weekly')
  })
  it('joins days Sun-first regardless of input order', () => {
    expect(buildPatternLabel('weekly', ['Wed', 'Sun', 'Mon'])).toBe('Weekly · Sun/Mon/Wed')
  })
})

describe('collapseSeries', () => {
  it('passes one-off rows through in order', () => {
    const a = row({ id: 'a' })
    const b = row({ id: 'b' })
    expect(collapseSeries([a, b], NOW)).toEqual([
      { kind: 'one-off', task: a },
      { kind: 'one-off', task: b },
    ])
  })

  it('emits a series entry once, at first-encounter position, preserving surrounding one-offs', () => {
    const g1a = row({
      id: 'g1a',
      recurrenceGroupId: 'g1',
      recurrence: 'daily',
      startAt: new Date('2026-07-20T09:00:00.000Z'),
    })
    const solo = row({ id: 'solo' })
    const g1b = row({
      id: 'g1b',
      recurrenceGroupId: 'g1',
      recurrence: 'daily',
      startAt: new Date('2026-07-21T09:00:00.000Z'),
    })
    const out = collapseSeries([g1a, solo, g1b], NOW)
    expect(out.map((e) => e.kind)).toEqual(['series', 'one-off'])
  })

  it('picks the earliest non-completed today occurrence as representative and today anchor', () => {
    const done = row({
      id: 'done',
      recurrenceGroupId: 'g',
      recurrence: 'daily',
      status: 'completed',
      startAt: new Date('2026-07-14T08:00:00.000Z'),
    })
    const pending = row({
      id: 'pending',
      recurrenceGroupId: 'g',
      recurrence: 'daily',
      startAt: new Date('2026-07-14T20:00:00.000Z'),
    })
    const future = row({
      id: 'future',
      recurrenceGroupId: 'g',
      recurrence: 'daily',
      startAt: new Date('2026-07-15T08:00:00.000Z'),
    })
    const out = collapseSeries([done, pending, future], NOW)
    expect(out).toHaveLength(1)
    const entry = out[0]
    if (entry?.kind !== 'series') throw new Error('expected series')
    expect(entry.group.representative.id).toBe('pending')
    expect(entry.group.todayOccurrenceId).toBe('pending')
    expect(entry.group.todayOccurrenceStatus).toBe('pending')
    expect(entry.group.nextDueIso).toBe('2026-07-14T20:00:00.000Z')
  })

  it('falls back to the earliest today occurrence when all today rows are completed', () => {
    const early = row({
      id: 'early',
      recurrenceGroupId: 'g',
      recurrence: 'daily',
      status: 'completed',
      startAt: new Date('2026-07-14T08:00:00.000Z'),
    })
    const late = row({
      id: 'late',
      recurrenceGroupId: 'g',
      recurrence: 'daily',
      status: 'completed',
      startAt: new Date('2026-07-14T20:00:00.000Z'),
    })
    const out = collapseSeries([early, late], NOW)
    const entry = out[0]
    if (entry?.kind !== 'series') throw new Error('expected series')
    expect(entry.group.todayOccurrenceId).toBe('early')
    expect(entry.group.todayOccurrenceStatus).toBe('completed')
  })

  it('picks the earliest future occurrence when nothing is due today', () => {
    const past = row({
      id: 'past',
      recurrenceGroupId: 'g',
      recurrence: 'weekly',
      status: 'completed',
      startAt: new Date('2026-07-07T09:00:00.000Z'),
    })
    const near = row({
      id: 'near',
      recurrenceGroupId: 'g',
      recurrence: 'weekly',
      startAt: new Date('2026-07-21T09:00:00.000Z'),
    })
    const far = row({
      id: 'far',
      recurrenceGroupId: 'g',
      recurrence: 'weekly',
      startAt: new Date('2026-07-28T09:00:00.000Z'),
    })
    const out = collapseSeries([past, near, far], NOW)
    const entry = out[0]
    if (entry?.kind !== 'series') throw new Error('expected series')
    expect(entry.group.representative.id).toBe('near')
    expect(entry.group.todayOccurrenceId).toBeNull()
    expect(entry.group.nextDueIso).toBe('2026-07-21T09:00:00.000Z')
  })

  it('marks an all-past series ended (latest representative, null nextDueIso)', () => {
    const older = row({
      id: 'older',
      recurrenceGroupId: 'g',
      recurrence: 'daily',
      status: 'completed',
      startAt: new Date('2026-07-01T09:00:00.000Z'),
    })
    const newer = row({
      id: 'newer',
      recurrenceGroupId: 'g',
      recurrence: 'daily',
      status: 'completed',
      startAt: new Date('2026-07-02T09:00:00.000Z'),
    })
    const out = collapseSeries([older, newer], NOW)
    const entry = out[0]
    if (entry?.kind !== 'series') throw new Error('expected series')
    expect(entry.group.representative.id).toBe('newer')
    expect(entry.group.nextDueIso).toBeNull()
    expect(entry.group.todayOccurrenceId).toBeNull()
  })

  it('handles a group whose rows all have null startAt', () => {
    const a = row({ id: 'a', recurrenceGroupId: 'g', recurrence: 'daily' })
    const b = row({ id: 'b', recurrenceGroupId: 'g', recurrence: 'daily' })
    const out = collapseSeries([a, b], NOW)
    const entry = out[0]
    if (entry?.kind !== 'series') throw new Error('expected series')
    expect(entry.group.representative.id).toBe('a')
    expect(entry.group.nextDueIso).toBeNull()
  })

  it('judges "today" in the series time zone, not UTC', () => {
    // 2026-07-15T02:00Z is still Jul 14 in America/New_York (UTC-4) — due today.
    const tzRow = row({
      id: 'tz',
      recurrenceGroupId: 'g',
      recurrence: 'daily',
      startAt: new Date('2026-07-15T02:00:00.000Z'),
      timeZone: 'America/New_York',
    })
    const out = collapseSeries([tzRow], NOW)
    const entry = out[0]
    if (entry?.kind !== 'series') throw new Error('expected series')
    expect(entry.group.todayOccurrenceId).toBe('tz')
  })

  it('computes the group current streak', () => {
    const done1 = row({
      id: 'd1',
      recurrenceGroupId: 'g',
      recurrence: 'daily',
      status: 'completed',
      startAt: new Date('2026-07-12T09:00:00.000Z'),
    })
    const done2 = row({
      id: 'd2',
      recurrenceGroupId: 'g',
      recurrence: 'daily',
      status: 'completed',
      startAt: new Date('2026-07-13T09:00:00.000Z'),
    })
    const todayPending = row({
      id: 'tp',
      recurrenceGroupId: 'g',
      recurrence: 'daily',
      startAt: new Date('2026-07-14T09:00:00.000Z'),
    })
    const out = collapseSeries([done1, done2, todayPending], NOW)
    const entry = out[0]
    if (entry?.kind !== 'series') throw new Error('expected series')
    expect(entry.group.groupStreak).toBe(2) // today pending = grace, not a break
  })

  it('labels the pattern from the representative', () => {
    const r = row({
      id: 'r',
      recurrenceGroupId: 'g',
      recurrence: 'weekly',
      recurrenceDays: ['Mon', 'Wed'],
      startAt: new Date('2026-07-20T09:00:00.000Z'),
    })
    const out = collapseSeries([r], NOW)
    const entry = out[0]
    if (entry?.kind !== 'series') throw new Error('expected series')
    expect(entry.group.patternLabel).toBe('Weekly · Mon/Wed')
  })
})
