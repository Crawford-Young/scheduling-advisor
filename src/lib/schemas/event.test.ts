import { describe, it, expect } from 'vitest'
import { createEventSchema, updateEventSchema, deleteEventSchema } from '@/lib/schemas/event'

describe('createEventSchema', () => {
  it('accepts a minimal payload with no activityId', () => {
    const r = createEventSchema.safeParse({ title: 'Standalone dentist visit' })
    expect(r.success).toBe(true)
  })

  it('accepts a null activityId (standalone event)', () => {
    const r = createEventSchema.safeParse({ title: 'Standalone', activityId: null })
    expect(r.success).toBe(true)
  })

  it('accepts a valid uuid activityId', () => {
    const r = createEventSchema.safeParse({
      title: 'Gym session',
      activityId: crypto.randomUUID(),
    })
    expect(r.success).toBe(true)
  })

  it('rejects a non-uuid activityId', () => {
    const r = createEventSchema.safeParse({ title: 'Gym session', activityId: 'nope' })
    expect(r.success).toBe(false)
  })

  it('accepts full optional fields', () => {
    const r = createEventSchema.safeParse({
      title: 'Gym session',
      activityId: crypto.randomUUID(),
      startAt: '2026-07-20T09:00:00.000Z',
      endAt: '2026-07-20T10:00:00.000Z',
      allDay: false,
      color: 'blue',
      location: 'Downtown gym',
      description: 'leg day',
    })
    expect(r.success).toBe(true)
  })

  it('rejects an empty title', () => {
    const r = createEventSchema.safeParse({ title: '' })
    expect(r.success).toBe(false)
  })

  it('rejects a non-datetime startAt', () => {
    const r = createEventSchema.safeParse({ title: 'x', startAt: 'not-a-date' })
    expect(r.success).toBe(false)
  })
})

describe('createEventSchema — visibility', () => {
  it.each(['public', 'busy', 'private'] as const)('accepts visibility "%s"', (visibility) => {
    const r = createEventSchema.safeParse({ title: 'x', visibility })
    expect(r.success).toBe(true)
  })

  it('accepts an omitted visibility (server resolves the default)', () => {
    const r = createEventSchema.safeParse({ title: 'x' })
    expect(r.success).toBe(true)
  })

  it('rejects an unknown visibility value', () => {
    const r = createEventSchema.safeParse({ title: 'x', visibility: 'secret' })
    expect(r.success).toBe(false)
  })
})

describe('createEventSchema — endAt > startAt refinement (A9 hardening)', () => {
  it('rejects endAt before startAt', () => {
    const r = createEventSchema.safeParse({
      title: 'Backwards',
      startAt: '2026-07-20T19:00:00.000Z',
      endAt: '2026-07-20T18:00:00.000Z',
    })
    expect(r.success).toBe(false)
  })

  it('rejects endAt equal to startAt (zero-duration is not a valid event)', () => {
    const r = createEventSchema.safeParse({
      title: 'Zero duration',
      startAt: '2026-07-20T19:00:00.000Z',
      endAt: '2026-07-20T19:00:00.000Z',
    })
    expect(r.success).toBe(false)
  })

  it('accepts endAt after startAt', () => {
    const r = createEventSchema.safeParse({
      title: 'Normal',
      startAt: '2026-07-20T18:00:00.000Z',
      endAt: '2026-07-20T19:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a startAt with no endAt (no cross-field check when one side is absent)', () => {
    const r = createEventSchema.safeParse({
      title: 'Only start',
      startAt: '2026-07-20T18:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })

  it('accepts an endAt with no startAt (no cross-field check when one side is absent)', () => {
    const r = createEventSchema.safeParse({
      title: 'Only end',
      endAt: '2026-07-20T19:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })

  it('accepts neither startAt nor endAt (unscheduled/all-day event)', () => {
    const r = createEventSchema.safeParse({ title: 'Someday' })
    expect(r.success).toBe(true)
  })
})

describe('updateEventSchema', () => {
  it('accepts an id-only payload', () => {
    const r = updateEventSchema.safeParse({ id: crypto.randomUUID() })
    expect(r.success).toBe(true)
  })

  it('accepts a status update', () => {
    const r = updateEventSchema.safeParse({ id: crypto.randomUUID(), status: 'completed' })
    expect(r.success).toBe(true)
  })

  it('rejects an invalid status', () => {
    const r = updateEventSchema.safeParse({ id: crypto.randomUUID(), status: 'archived' })
    expect(r.success).toBe(false)
  })

  it('accepts a locked flag', () => {
    const r = updateEventSchema.safeParse({ id: crypto.randomUUID(), locked: true })
    expect(r.success).toBe(true)
  })

  it('accepts clearing activityId to null (detach from activity)', () => {
    const r = updateEventSchema.safeParse({ id: crypto.randomUUID(), activityId: null })
    expect(r.success).toBe(true)
  })

  it('accepts a visibility update', () => {
    const r = updateEventSchema.safeParse({ id: crypto.randomUUID(), visibility: 'public' })
    expect(r.success).toBe(true)
  })

  it('rejects an invalid visibility value', () => {
    const r = updateEventSchema.safeParse({ id: crypto.randomUUID(), visibility: 'secret' })
    expect(r.success).toBe(false)
  })

  it('rejects a non-uuid id', () => {
    const r = updateEventSchema.safeParse({ id: 'nope' })
    expect(r.success).toBe(false)
  })

  it('accepts a payload with endAt before startAt at the schema layer — cross-field enforcement is merge-then-validate in updateEvent (server/actions/events.ts), not this partial schema', () => {
    const r = updateEventSchema.safeParse({
      id: crypto.randomUUID(),
      startAt: '2026-07-20T19:00:00.000Z',
      endAt: '2026-07-20T18:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })
})

describe('deleteEventSchema', () => {
  it('accepts a valid uuid id', () => {
    const r = deleteEventSchema.safeParse({ id: crypto.randomUUID() })
    expect(r.success).toBe(true)
  })

  it('rejects a non-uuid id', () => {
    const r = deleteEventSchema.safeParse({ id: 'nope' })
    expect(r.success).toBe(false)
  })
})
