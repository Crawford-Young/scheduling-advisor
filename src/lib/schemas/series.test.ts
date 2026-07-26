import { describe, it, expect } from 'vitest'
import {
  seriesFreqSchema,
  createSeriesSchema,
  updateSeriesSchema,
  deleteSeriesSchema,
} from '@/lib/schemas/series'

const base = {
  title: 'Standup',
  startMinutes: 540,
  durationMin: 30,
}

describe('seriesFreqSchema', () => {
  it('accepts the four frequencies', () => {
    for (const freq of ['daily', 'weekly', 'monthly', 'yearly']) {
      expect(seriesFreqSchema.safeParse(freq).success).toBe(true)
    }
  })

  it('rejects an unknown frequency', () => {
    expect(seriesFreqSchema.safeParse('hourly').success).toBe(false)
  })
})

describe('createSeriesSchema — valid payloads per freq', () => {
  it('accepts a daily series', () => {
    const r = createSeriesSchema.safeParse({ ...base, freq: 'daily' })
    expect(r.success).toBe(true)
  })

  it('accepts a weekly series with weekdays', () => {
    const r = createSeriesSchema.safeParse({ ...base, freq: 'weekly', weekdays: [1, 3, 5] })
    expect(r.success).toBe(true)
  })

  it('accepts a weekly series including Sunday and Saturday', () => {
    const r = createSeriesSchema.safeParse({ ...base, freq: 'weekly', weekdays: [0, 6] })
    expect(r.success).toBe(true)
  })

  it('accepts a monthly day-of-month series', () => {
    const r = createSeriesSchema.safeParse({ ...base, freq: 'monthly', dayOfMonth: 15 })
    expect(r.success).toBe(true)
  })

  it('accepts a monthly nth-weekday series (3rd Thursday)', () => {
    const r = createSeriesSchema.safeParse({
      ...base,
      freq: 'monthly',
      nthOrdinal: 3,
      nthWeekday: 4,
    })
    expect(r.success).toBe(true)
  })

  it('accepts a monthly last-weekday series (nthOrdinal -1)', () => {
    const r = createSeriesSchema.safeParse({
      ...base,
      freq: 'monthly',
      nthOrdinal: -1,
      nthWeekday: 5,
    })
    expect(r.success).toBe(true)
  })

  it('accepts a yearly series with month + dayOfMonth', () => {
    const r = createSeriesSchema.safeParse({ ...base, freq: 'yearly', month: 3, dayOfMonth: 5 })
    expect(r.success).toBe(true)
  })

  it('accepts all optional fill fields', () => {
    const r = createSeriesSchema.safeParse({
      ...base,
      freq: 'daily',
      activityId: crypto.randomUUID(),
      description: 'Daily huddle',
      location: 'Zoom',
      color: 'blue',
      timeZone: 'America/New_York',
      until: '2026-12-31',
    })
    expect(r.success).toBe(true)
  })

  it('accepts an anchorStartAt input-only field', () => {
    const r = createSeriesSchema.safeParse({
      ...base,
      freq: 'weekly',
      weekdays: [3],
      anchorStartAt: '2026-09-03T09:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })
})

describe('createSeriesSchema — visibility', () => {
  it.each(['public', 'friends', 'busy', 'private'] as const)(
    'accepts visibility "%s"',
    (visibility) => {
      const r = createSeriesSchema.safeParse({ ...base, freq: 'daily', visibility })
      expect(r.success).toBe(true)
    },
  )

  it('accepts an omitted visibility (server resolves the default)', () => {
    const r = createSeriesSchema.safeParse({ ...base, freq: 'daily' })
    expect(r.success).toBe(true)
  })

  it('rejects an unknown visibility value', () => {
    const r = createSeriesSchema.safeParse({ ...base, freq: 'daily', visibility: 'secret' })
    expect(r.success).toBe(false)
  })
})

describe('createSeriesSchema — boundary values', () => {
  it('accepts startMinutes 0', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'daily', startMinutes: 0 }).success).toBe(
      true,
    )
  })

  it('accepts startMinutes 1439', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'daily', startMinutes: 1439 }).success,
    ).toBe(true)
  })

  it('rejects startMinutes 1440', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'daily', startMinutes: 1440 }).success,
    ).toBe(false)
  })

  it('rejects negative startMinutes', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'daily', startMinutes: -1 }).success).toBe(
      false,
    )
  })

  it('accepts durationMin 1', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'daily', durationMin: 1 }).success).toBe(
      true,
    )
  })

  it('rejects durationMin 0', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'daily', durationMin: 0 }).success).toBe(
      false,
    )
  })

  it('rejects a weekday above 6', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'weekly', weekdays: [7] }).success).toBe(
      false,
    )
  })

  it('rejects nthOrdinal above 4', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'monthly', nthOrdinal: 5, nthWeekday: 1 })
        .success,
    ).toBe(false)
  })

  it('rejects nthOrdinal 0', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'monthly', nthOrdinal: 0, nthWeekday: 1 })
        .success,
    ).toBe(false)
  })

  it('rejects dayOfMonth above 31', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'monthly', dayOfMonth: 32 }).success).toBe(
      false,
    )
  })

  it('rejects month above 12', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'yearly', month: 13, dayOfMonth: 1 }).success,
    ).toBe(false)
  })
})

describe('createSeriesSchema — superRefine per-freq validity', () => {
  it('rejects daily with weekdays', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'daily', weekdays: [1] }).success).toBe(
      false,
    )
  })

  it('rejects daily with dayOfMonth', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'daily', dayOfMonth: 5 }).success).toBe(
      false,
    )
  })

  it('rejects weekly without weekdays', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'weekly' }).success).toBe(false)
  })

  it('rejects weekly with an empty weekdays array', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'weekly', weekdays: [] }).success).toBe(
      false,
    )
  })

  it('rejects weekly with a stray month field', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'weekly', weekdays: [1], month: 3 }).success,
    ).toBe(false)
  })

  it('rejects monthly with both modes present', () => {
    expect(
      createSeriesSchema.safeParse({
        ...base,
        freq: 'monthly',
        dayOfMonth: 15,
        nthOrdinal: 2,
        nthWeekday: 3,
      }).success,
    ).toBe(false)
  })

  it('rejects monthly with neither mode present', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'monthly' }).success).toBe(false)
  })

  it('rejects monthly nth mode missing nthWeekday', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'monthly', nthOrdinal: 2 }).success).toBe(
      false,
    )
  })

  it('rejects monthly nth mode missing nthOrdinal', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'monthly', nthWeekday: 2 }).success).toBe(
      false,
    )
  })

  it('rejects monthly with a stray weekdays field', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'monthly', dayOfMonth: 15, weekdays: [1] })
        .success,
    ).toBe(false)
  })

  it('rejects yearly missing month', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'yearly', dayOfMonth: 5 }).success).toBe(
      false,
    )
  })

  it('rejects yearly missing dayOfMonth', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'yearly', month: 3 }).success).toBe(false)
  })

  it('rejects yearly with a stray nthOrdinal field', () => {
    expect(
      createSeriesSchema.safeParse({
        ...base,
        freq: 'yearly',
        month: 3,
        dayOfMonth: 5,
        nthOrdinal: 2,
      }).success,
    ).toBe(false)
  })
})

describe('createSeriesSchema — exhaustive stray wrong-freq field rejection', () => {
  it('rejects daily with nthOrdinal', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'daily', nthOrdinal: 2 }).success).toBe(
      false,
    )
  })

  it('rejects daily with nthWeekday', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'daily', nthWeekday: 2 }).success).toBe(
      false,
    )
  })

  it('rejects daily with month', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'daily', month: 3 }).success).toBe(false)
  })

  it('rejects weekly with dayOfMonth', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'weekly', weekdays: [1], dayOfMonth: 5 })
        .success,
    ).toBe(false)
  })

  it('rejects weekly with nthOrdinal', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'weekly', weekdays: [1], nthOrdinal: 2 })
        .success,
    ).toBe(false)
  })

  it('rejects weekly with nthWeekday', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'weekly', weekdays: [1], nthWeekday: 2 })
        .success,
    ).toBe(false)
  })

  it('rejects monthly day-mode with a stray month field', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'monthly', dayOfMonth: 15, month: 3 }).success,
    ).toBe(false)
  })

  it('rejects yearly with a stray weekdays field', () => {
    expect(
      createSeriesSchema.safeParse({
        ...base,
        freq: 'yearly',
        month: 3,
        dayOfMonth: 5,
        weekdays: [1],
      }).success,
    ).toBe(false)
  })

  it('rejects yearly with a stray nthWeekday field', () => {
    expect(
      createSeriesSchema.safeParse({
        ...base,
        freq: 'yearly',
        month: 3,
        dayOfMonth: 5,
        nthWeekday: 2,
      }).success,
    ).toBe(false)
  })
})

describe('createSeriesSchema — misc field validation', () => {
  it('rejects an empty title', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'daily', title: '' }).success).toBe(false)
  })

  it('accepts a valid IANA timeZone', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'daily', timeZone: 'Europe/London' }).success,
    ).toBe(true)
  })

  it('rejects a garbage timeZone', () => {
    expect(
      createSeriesSchema.safeParse({ ...base, freq: 'daily', timeZone: 'Middle/Earth' }).success,
    ).toBe(false)
  })

  it('accepts a null timeZone', () => {
    expect(createSeriesSchema.safeParse({ ...base, freq: 'daily', timeZone: null }).success).toBe(
      true,
    )
  })
})

describe('updateSeriesSchema', () => {
  it('accepts a partial payload with only id + title', () => {
    const r = updateSeriesSchema.safeParse({ id: crypto.randomUUID(), title: 'New name' })
    expect(r.success).toBe(true)
  })

  it('rejects a non-uuid id', () => {
    const r = updateSeriesSchema.safeParse({ id: 'nope', title: 'x' })
    expect(r.success).toBe(false)
  })

  it('rejects a missing id', () => {
    const r = updateSeriesSchema.safeParse({ title: 'x' })
    expect(r.success).toBe(false)
  })

  it('accepts an updated freq without the per-freq cross-field rules', () => {
    // updateSeriesSchema does not carry superRefine — merge-then-revalidate in the action.
    const r = updateSeriesSchema.safeParse({ id: crypto.randomUUID(), freq: 'weekly' })
    expect(r.success).toBe(true)
  })

  it('accepts a visibility update', () => {
    const r = updateSeriesSchema.safeParse({ id: crypto.randomUUID(), visibility: 'busy' })
    expect(r.success).toBe(true)
  })

  it('rejects an invalid visibility value', () => {
    const r = updateSeriesSchema.safeParse({ id: crypto.randomUUID(), visibility: 'secret' })
    expect(r.success).toBe(false)
  })
})

describe('deleteSeriesSchema', () => {
  it('accepts the keep mode', () => {
    const r = deleteSeriesSchema.safeParse({ id: crypto.randomUUID(), mode: 'keep' })
    expect(r.success).toBe(true)
  })

  it('accepts the deleteFuture mode', () => {
    const r = deleteSeriesSchema.safeParse({ id: crypto.randomUUID(), mode: 'deleteFuture' })
    expect(r.success).toBe(true)
  })

  it('rejects an unknown mode', () => {
    const r = deleteSeriesSchema.safeParse({ id: crypto.randomUUID(), mode: 'wipe' })
    expect(r.success).toBe(false)
  })

  it('rejects a non-uuid id', () => {
    const r = deleteSeriesSchema.safeParse({ id: 'nope', mode: 'keep' })
    expect(r.success).toBe(false)
  })
})
