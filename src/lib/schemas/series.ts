import { z } from 'zod'
import { visibilitySchema } from '@/lib/schemas/visibility'

// Sunday-first weekday index, matching Postgres/JS `Date#getDay()` (0-6).
const MIN_WEEKDAY = 0
const MAX_WEEKDAY = 6

// Day-of-month for monthly day-mode and yearly rules; clamped to short months
// at generation time (31 → 30/28), so the schema only bounds the raw input.
const MIN_DAY_OF_MONTH = 1
const MAX_DAY_OF_MONTH = 31

// Monthly nth-weekday ordinal: 1st–4th occurrence, or -1 for the last.
const MIN_NTH_ORDINAL = 1
const MAX_NTH_ORDINAL = 4
const LAST_NTH_ORDINAL = -1

// Calendar month, 1 = January … 12 = December.
const MIN_MONTH = 1
const MAX_MONTH = 12

// Minutes-since-midnight, local wall-clock in the series' `timeZone`.
const MIN_START_MINUTES = 0
const MAX_START_MINUTES = 1439

// Longest real IANA zone id ("America/Argentina/Buenos_Aires") is 32 chars; 64
// leaves headroom while rejecting obviously-garbage input. Mirrors
// src/lib/schemas/activity.ts's timeZoneSchema — duplicated (not imported)
// because that one is not exported; A9 teardown can consolidate them.
const MAX_TIME_ZONE_LENGTH = 64

// A string is a valid IANA zone id iff Intl accepts it as a timeZone option
// (throws RangeError otherwise). Node ships full ICU, so this is authoritative.
function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

// IANA time zone the series' start time is local wall-clock in. Nullish on the
// row; a null/omitted timeZone falls back to UTC day math in generation.
const timeZoneSchema = z
  .string()
  .min(1)
  .max(MAX_TIME_ZONE_LENGTH)
  .refine(isValidTimeZone, 'Invalid IANA time zone')

export const seriesFreqSchema = z.enum(['daily', 'weekly', 'monthly', 'yearly'])
export type SeriesFreq = z.infer<typeof seriesFreqSchema>

const seriesBaseShape = z.object({
  activityId: z.string().uuid().nullable().optional(),
  title: z.string().min(1, 'Title required'),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  visibility: visibilitySchema.optional(),
  freq: seriesFreqSchema,
  weekdays: z.array(z.number().int().min(MIN_WEEKDAY).max(MAX_WEEKDAY)).nonempty().optional(),
  dayOfMonth: z.number().int().min(MIN_DAY_OF_MONTH).max(MAX_DAY_OF_MONTH).optional(),
  nthOrdinal: z
    .union([
      z.literal(LAST_NTH_ORDINAL),
      z.number().int().min(MIN_NTH_ORDINAL).max(MAX_NTH_ORDINAL),
    ])
    .optional(),
  nthWeekday: z.number().int().min(MIN_WEEKDAY).max(MAX_WEEKDAY).optional(),
  month: z.number().int().min(MIN_MONTH).max(MAX_MONTH).optional(),
  startMinutes: z.number().int().min(MIN_START_MINUTES).max(MAX_START_MINUTES),
  durationMin: z.number().int().positive(),
  timeZone: timeZoneSchema.nullable().optional(),
  until: z.coerce.date().nullable().optional(),
  // Input-only: A4's createSeries strips this before insert and uses it to seed
  // `generatedThrough` so generation begins AT the anchor, not today.
  anchorStartAt: z.coerce.date().optional(),
})

type SeriesBase = z.infer<typeof seriesBaseShape>

// Enforce per-freq field validity — fields belonging to another frequency are
// rejected outright, so a stored rule is unambiguous.
function refineFreqFields(data: SeriesBase, ctx: z.RefinementCtx): void {
  const { freq, weekdays, dayOfMonth, nthOrdinal, nthWeekday, month } = data
  const reject = (path: keyof SeriesBase, message: string): void => {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] })
  }

  switch (freq) {
    case 'daily': {
      if (weekdays !== undefined) reject('weekdays', 'Daily series take no weekdays')
      if (dayOfMonth !== undefined) reject('dayOfMonth', 'Daily series take no dayOfMonth')
      if (nthOrdinal !== undefined) reject('nthOrdinal', 'Daily series take no nthOrdinal')
      if (nthWeekday !== undefined) reject('nthWeekday', 'Daily series take no nthWeekday')
      if (month !== undefined) reject('month', 'Daily series take no month')
      break
    }
    case 'weekly': {
      if (weekdays === undefined) reject('weekdays', 'Weekly series require weekdays')
      if (dayOfMonth !== undefined) reject('dayOfMonth', 'Weekly series take no dayOfMonth')
      if (nthOrdinal !== undefined) reject('nthOrdinal', 'Weekly series take no nthOrdinal')
      if (nthWeekday !== undefined) reject('nthWeekday', 'Weekly series take no nthWeekday')
      if (month !== undefined) reject('month', 'Weekly series take no month')
      break
    }
    case 'monthly': {
      const hasDayMode = dayOfMonth !== undefined
      const hasNthMode = nthOrdinal !== undefined && nthWeekday !== undefined
      const partialNth = (nthOrdinal !== undefined) !== (nthWeekday !== undefined)
      if (hasDayMode && hasNthMode) {
        reject('dayOfMonth', 'Monthly series use either dayOfMonth or nth-weekday, not both')
      }
      if (!hasDayMode && !hasNthMode) {
        reject('dayOfMonth', 'Monthly series require a dayOfMonth or an nth-weekday pair')
      }
      if (partialNth) {
        reject('nthOrdinal', 'Monthly nth-weekday mode needs both nthOrdinal and nthWeekday')
      }
      if (weekdays !== undefined) reject('weekdays', 'Monthly series take no weekdays')
      if (month !== undefined) reject('month', 'Monthly series take no month')
      break
    }
    case 'yearly': {
      if (month === undefined) reject('month', 'Yearly series require a month')
      if (dayOfMonth === undefined) reject('dayOfMonth', 'Yearly series require a dayOfMonth')
      if (weekdays !== undefined) reject('weekdays', 'Yearly series take no weekdays')
      if (nthOrdinal !== undefined) reject('nthOrdinal', 'Yearly series take no nthOrdinal')
      if (nthWeekday !== undefined) reject('nthWeekday', 'Yearly series take no nthWeekday')
      break
    }
  }
}

export const createSeriesSchema = seriesBaseShape.superRefine(refineFreqFields)
export type CreateSeries = z.infer<typeof createSeriesSchema>

// Partial base + id — the action merges onto the fetched row and revalidates
// against the full createSeriesSchema, so the per-freq rules apply post-merge.
export const updateSeriesSchema = seriesBaseShape.partial().extend({ id: z.string().uuid() })
export type UpdateSeries = z.infer<typeof updateSeriesSchema>

export const deleteSeriesSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(['keep', 'deleteFuture']),
})
export type DeleteSeries = z.infer<typeof deleteSeriesSchema>
