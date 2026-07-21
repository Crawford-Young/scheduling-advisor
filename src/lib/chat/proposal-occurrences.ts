import { z } from 'zod'

/**
 * Pure recurrence vocabulary + fan-out for the chat `proposeEvent` approval
 * flow. No server/db/auth imports — client-safe so `EventProposalCard` can run
 * it inline on approval, and unit-testable without mocks.
 *
 * This is the activity-model successor to the dropped `tasks` series fan-out:
 * a recurring proposal expands into N INDEPENDENT standalone events (no series
 * linkage), which the card then persists via `createEvents`. Date math is done
 * in LOCAL calendar terms (DST-safe wall-clock preservation) to match the
 * local-wall-clock invariant and the card's own local anchor construction.
 */

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly'

export const recurrenceFrequencySchema: z.ZodEnum<['daily', 'weekly', 'monthly']> = z.enum([
  'daily',
  'weekly',
  'monthly',
])

export type DayOfWeek = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'

// Index order matches Date#getDay (0 = Sunday) — drives weekday fan-out and the
// contiguous-range collapse in the card's recurrence summary.
export const WEEKDAY_ORDER: readonly DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const dayOfWeekSchema: z.ZodEnum<['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']> = z.enum(
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
)

export interface ProposalInput {
  readonly title: string
  readonly date: string // YYYY-MM-DD, first occurrence
  readonly start: string // HH:MM local
  readonly end: string // HH:MM local
  readonly description?: string
  readonly recurrence?: RecurrenceFrequency
  readonly recurrenceDays?: readonly DayOfWeek[]
  readonly recurrenceCount?: number
}

/** One standalone event to persist — the shape `createEvent`/`createEvents` accept. */
export interface EventOccurrence {
  readonly title: string
  readonly description?: string
  readonly startAt: string // ISO instant
  readonly endAt: string // ISO instant
}

const DAYS_PER_WEEK = 7
const SINGLE_WEEK = 1

/** Local Date from a YYYY-MM-DD date + HH:MM time (wall-clock, host TZ). */
function localDateTime(date: string, time: string): Date {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y!, mo! - 1, d!, h!, min!)
}

/** Add `n` calendar days to a local instant, preserving wall-clock time-of-day. */
function addLocalDays(base: Date, n: number): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + n,
    base.getHours(),
    base.getMinutes(),
  )
}

/** Add `n` calendar months to a local instant, preserving wall-clock time-of-day. */
function addLocalMonths(base: Date, n: number): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth() + n,
    base.getDate(),
    base.getHours(),
    base.getMinutes(),
  )
}

/**
 * Expand a `proposeEvent` proposal into the concrete standalone events to
 * create. A non-recurring proposal yields one; a weekly-with-weekdays proposal
 * yields one per selected weekday per repeated week; an interval proposal
 * (daily/weekly/monthly + count) yields `count` stepped occurrences.
 */
export function expandProposalOccurrences(input: ProposalInput): readonly EventOccurrence[] {
  const anchorStart = localDateTime(input.date, input.start)
  const anchorEnd = localDateTime(input.date, input.end)

  const make = (start: Date, end: Date): EventOccurrence => ({
    title: input.title,
    ...(input.description !== undefined && { description: input.description }),
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  })

  const isWeekdayPattern =
    input.recurrence === 'weekly' &&
    input.recurrenceDays !== undefined &&
    input.recurrenceDays.length > 0

  if (isWeekdayPattern) {
    const weeks =
      input.recurrenceCount !== undefined && input.recurrenceCount > SINGLE_WEEK
        ? input.recurrenceCount
        : SINGLE_WEEK
    const anchorDow = anchorStart.getDay()
    const selectedDows = input
      .recurrenceDays!.map((token) => WEEKDAY_ORDER.indexOf(token))
      .sort((a, b) => a - b)
    const out: EventOccurrence[] = []
    for (let week = 0; week < weeks; week++) {
      for (const dow of selectedDows) {
        const shift = dow - anchorDow + week * DAYS_PER_WEEK
        out.push(make(addLocalDays(anchorStart, shift), addLocalDays(anchorEnd, shift)))
      }
    }
    return out
  }

  const isInterval =
    input.recurrence !== undefined &&
    input.recurrenceCount !== undefined &&
    input.recurrenceCount > 1

  if (isInterval) {
    const count = input.recurrenceCount!
    const step = (base: Date, i: number): Date => {
      if (input.recurrence === 'daily') return addLocalDays(base, i)
      if (input.recurrence === 'weekly') return addLocalDays(base, i * DAYS_PER_WEEK)
      return addLocalMonths(base, i)
    }
    return Array.from({ length: count }, (_, i) => make(step(anchorStart, i), step(anchorEnd, i)))
  }

  return [make(anchorStart, anchorEnd)]
}
