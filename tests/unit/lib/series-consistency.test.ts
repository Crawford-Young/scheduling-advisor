import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'
import { findSeriesDrift, reportSeriesDrift, type DriftRow } from '@/lib/series-consistency'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

function makeRow(overrides: Partial<DriftRow> = {}): DriftRow {
  return {
    recurrenceGroupId: 'group-1',
    title: 'Morning run',
    color: null,
    location: null,
    description: null,
    allDay: false,
    recurrence: 'weekly',
    recurrenceDays: ['Mon'],
    recurrenceCount: null,
    startAt: new Date('2026-07-06T09:00:00.000Z'),
    endAt: new Date('2026-07-06T10:00:00.000Z'),
    ...overrides,
  }
}

describe('findSeriesDrift', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports no drift for an identical group across different dates', () => {
    const rows = [
      makeRow(),
      makeRow({
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
    ]

    expect(findSeriesDrift(rows)).toEqual([])
  })

  it('treats a group of a single row as trivially clean', () => {
    expect(findSeriesDrift([makeRow()])).toEqual([])
  })

  it('flags a diverged title', () => {
    const rows = [
      makeRow(),
      makeRow({
        title: 'Evening run',
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
    ]

    expect(findSeriesDrift(rows)).toEqual([{ groupId: 'group-1', fields: ['title'] }])
  })

  it('flags a diverged color', () => {
    const rows = [makeRow(), makeRow({ color: 'blue' })]
    expect(findSeriesDrift(rows)).toEqual([{ groupId: 'group-1', fields: ['color'] }])
  })

  it('flags a diverged location', () => {
    const rows = [makeRow(), makeRow({ location: 'Park' })]
    expect(findSeriesDrift(rows)).toEqual([{ groupId: 'group-1', fields: ['location'] }])
  })

  it('flags a diverged description', () => {
    const rows = [makeRow(), makeRow({ description: 'Bring water' })]
    expect(findSeriesDrift(rows)).toEqual([{ groupId: 'group-1', fields: ['description'] }])
  })

  it('flags a diverged allDay flag', () => {
    const rows = [makeRow(), makeRow({ allDay: true })]
    expect(findSeriesDrift(rows)).toEqual([{ groupId: 'group-1', fields: ['allDay'] }])
  })

  it('flags a diverged recurrence pattern', () => {
    const rows = [makeRow(), makeRow({ recurrence: 'daily' })]
    expect(findSeriesDrift(rows)).toEqual([{ groupId: 'group-1', fields: ['recurrence'] }])
  })

  it('flags a diverged recurrenceCount', () => {
    const rows = [makeRow({ recurrenceCount: 4 }), makeRow({ recurrenceCount: 8 })]
    expect(findSeriesDrift(rows)).toEqual([{ groupId: 'group-1', fields: ['recurrenceCount'] }])
  })

  it('flags a diverged UTC time-of-day', () => {
    const rows = [
      makeRow(),
      makeRow({
        startAt: new Date('2026-07-13T14:00:00.000Z'),
        endAt: new Date('2026-07-13T15:00:00.000Z'),
      }),
    ]

    expect(findSeriesDrift(rows)).toEqual([{ groupId: 'group-1', fields: ['timeOfDay'] }])
  })

  it('flags a diverged duration while time-of-day stays aligned', () => {
    const rows = [
      makeRow(),
      makeRow({
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T11:30:00.000Z'),
      }),
    ]

    expect(findSeriesDrift(rows)).toEqual([{ groupId: 'group-1', fields: ['duration'] }])
  })

  it('flags duration drift when only some rows in the group have a null endAt', () => {
    const rows = [makeRow(), makeRow({ endAt: null })]
    expect(findSeriesDrift(rows)).toEqual([{ groupId: 'group-1', fields: ['duration'] }])
  })

  it('is clean when every row agrees on a null endAt', () => {
    const rows = [makeRow({ endAt: null }), makeRow({ endAt: null })]
    expect(findSeriesDrift(rows)).toEqual([])
  })

  it('flags timeOfDay drift when only some rows in the group have a null startAt', () => {
    const rows = [makeRow(), makeRow({ startAt: null, endAt: null })]
    expect(findSeriesDrift(rows)).toEqual([
      { groupId: 'group-1', fields: ['timeOfDay', 'duration'] },
    ])
  })

  it('does not flag per-occurrence differences (status/locked) that live outside DriftRow', () => {
    interface RowWithOccurrenceFields extends DriftRow {
      readonly status: string
      readonly locked: boolean
    }

    const rows: readonly RowWithOccurrenceFields[] = [
      { ...makeRow(), status: 'pending', locked: false },
      {
        ...makeRow({
          startAt: new Date('2026-07-13T09:00:00.000Z'),
          endAt: new Date('2026-07-13T10:00:00.000Z'),
        }),
        status: 'completed',
        locked: true,
      },
    ]

    expect(findSeriesDrift(rows)).toEqual([])
  })

  it('ignores rows with a null recurrenceGroupId', () => {
    const rows = [
      makeRow({ recurrenceGroupId: null, title: 'Ungrouped one' }),
      makeRow({ recurrenceGroupId: null, title: 'Ungrouped two' }),
      makeRow(),
      makeRow({
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
    ]

    expect(findSeriesDrift(rows)).toEqual([])
  })

  it('treats recurrenceDays as order-insensitive', () => {
    const rows = [
      makeRow({ recurrenceDays: ['Mon', 'Wed'] }),
      makeRow({
        recurrenceDays: ['Wed', 'Mon'],
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
    ]

    expect(findSeriesDrift(rows)).toEqual([])
  })

  it('treats a null recurrenceDays and an empty array as equivalent', () => {
    const rows = [
      makeRow({ recurrenceDays: null }),
      makeRow({
        recurrenceDays: [],
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
    ]

    expect(findSeriesDrift(rows)).toEqual([])
  })

  it('flags a recurrenceDays set mismatch driven purely by differing set size', () => {
    const rows = [
      makeRow({ recurrenceDays: ['Mon'] }),
      makeRow({
        recurrenceDays: ['Mon', 'Wed'],
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
    ]

    expect(findSeriesDrift(rows)).toEqual([{ groupId: 'group-1', fields: ['recurrenceDays'] }])
  })

  it('flags a genuine recurrenceDays set mismatch', () => {
    const rows = [
      makeRow({ recurrenceDays: ['Mon'] }),
      makeRow({
        recurrenceDays: ['Tue'],
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
    ]

    expect(findSeriesDrift(rows)).toEqual([{ groupId: 'group-1', fields: ['recurrenceDays'] }])
  })

  it('reports drift for multiple distinct groups independently', () => {
    const rows = [
      makeRow({ recurrenceGroupId: 'group-1', title: 'A' }),
      makeRow({
        recurrenceGroupId: 'group-1',
        title: 'B',
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
      makeRow({ recurrenceGroupId: 'group-2', color: 'red' }),
      makeRow({
        recurrenceGroupId: 'group-2',
        color: 'green',
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
    ]

    const result = findSeriesDrift(rows)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ groupId: 'group-1', fields: ['title'] })
    expect(result).toContainEqual({ groupId: 'group-2', fields: ['color'] })
  })

  it('returns an empty array for an empty input', () => {
    expect(findSeriesDrift([])).toEqual([])
  })
})

describe('reportSeriesDrift', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs and reports to Sentry when drift is present', () => {
    const rows = [
      makeRow(),
      makeRow({
        title: 'Evening run',
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
    ]

    reportSeriesDrift(rows)

    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'series drift',
      expect.objectContaining({
        extra: expect.objectContaining({ groupId: 'group-1', fields: ['title'] }),
      }),
    )
  })

  it('reports one drift per drifted group and skips clean groups', () => {
    const rows = [
      makeRow({ recurrenceGroupId: 'group-1', title: 'A' }),
      makeRow({
        recurrenceGroupId: 'group-1',
        title: 'B',
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
      makeRow({ recurrenceGroupId: 'group-2' }),
      makeRow({
        recurrenceGroupId: 'group-2',
        startAt: new Date('2026-07-13T09:00:00.000Z'),
        endAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
    ]

    reportSeriesDrift(rows)

    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
  })

  it('calls neither logger nor Sentry when no drift is present', () => {
    reportSeriesDrift([makeRow()])

    expect(logger.error).not.toHaveBeenCalled()
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('does not throw on an empty array', () => {
    expect(() => reportSeriesDrift([])).not.toThrow()
    expect(logger.error).not.toHaveBeenCalled()
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('does not throw when every row has a null recurrenceGroupId', () => {
    const rows = [
      makeRow({ recurrenceGroupId: null }),
      makeRow({ recurrenceGroupId: null, title: 'Something else' }),
    ]

    expect(() => reportSeriesDrift(rows)).not.toThrow()
    expect(logger.error).not.toHaveBeenCalled()
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })
})
