import { z } from 'zod'

/**
 * Shared recurrence vocabulary for the chat `proposeEvent` approval flow —
 * pure constants/types/schemas, no logic. Split out of the retired
 * `proposal-occurrences.ts` (event-series wave) so the weekday/frequency
 * vocabulary survives the client-side occurrence-expansion teardown; every
 * consumer (`EventProposalCard`, `tool-result-renderer`, `pending-proposals`)
 * now imports from here directly.
 */

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly'

export const recurrenceFrequencySchema: z.ZodEnum<['daily', 'weekly', 'monthly']> = z.enum([
  'daily',
  'weekly',
  'monthly',
])

export type DayOfWeek = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'

// Index order matches Date#getDay (0 = Sunday) — drives the weekday→index
// mapping for `createSeries.weekdays` and the card's contiguous-range collapse
// in its recurrence summary.
export const WEEKDAY_ORDER: readonly DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const dayOfWeekSchema: z.ZodEnum<['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']> = z.enum(
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
)
