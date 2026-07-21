import { z } from 'zod'

// Sunday-first weekday index, matching Postgres/JS `Date#getDay()` (0-6).
const MIN_SCHEDULE_DAY = 0
const MAX_SCHEDULE_DAY = 6

// Minutes-since-midnight, local wall-clock in the activity's `timeZone`.
const MIN_START_MINUTES = 0
const MAX_START_MINUTES = 1439

const MAX_TITLE_LENGTH = 200
const MAX_COLOR_LENGTH = 32
const MAX_DESCRIPTION_LENGTH = 2000
const MAX_LOCATION_LENGTH = 200
const MIN_WEEKLY_TARGET_SESSIONS = 1

// Longest real IANA zone id ("America/Argentina/Buenos_Aires") is 32 chars; 64
// leaves headroom while rejecting obviously-garbage input. Mirrors
// src/lib/schemas/task.ts's timeZoneSchema — duplicated (not imported) because
// task.ts is deleted at A8 while activities' timeZone lives on.
const MAX_TIME_ZONE_LENGTH = 64

// A string is a valid IANA zone id iff Intl accepts it as a timeZone option
// (throws RangeError otherwise). Node ships full ICU, so this is authoritative.
// Load-bearing: an invalid value here would otherwise reach
// `zonedWallClock` (series-generation.ts) — a bare `new Intl.DateTimeFormat`
// call with no try/catch — and throw an uncaught RangeError during generation.
function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

// IANA time zone the activity's per-day schedule times are local wall-clock
// in. Optional on create/update; a null/omitted timeZone on the row falls
// back to UTC day math in generation.
const timeZoneSchema = z
  .string()
  .min(1)
  .max(MAX_TIME_ZONE_LENGTH)
  .refine(isValidTimeZone, 'Invalid IANA time zone')

export const activityScheduleSlotSchema = z.object({
  day: z.number().int().min(MIN_SCHEDULE_DAY).max(MAX_SCHEDULE_DAY),
  startMinutes: z.number().int().min(MIN_START_MINUTES).max(MAX_START_MINUTES),
  durationMin: z.number().int().positive(),
})

export type ActivityScheduleSlot = z.infer<typeof activityScheduleSlotSchema>

const activityBaseShape = z.object({
  title: z.string().min(1, 'Title required').max(MAX_TITLE_LENGTH),
  color: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).nullable().optional(),
  defaultLocation: z.string().max(MAX_LOCATION_LENGTH).nullable().optional(),
  minDurationMin: z.number().int().positive(),
  maxDurationMin: z.number().int().positive(),
  weeklyTargetSessions: z.number().int().min(MIN_WEEKLY_TARGET_SESSIONS),
  schedule: z.array(activityScheduleSlotSchema).readonly(),
  timeZone: timeZoneSchema.optional(),
})

// A slot's durationMin must fall within the activity's [min, max] session
// bounds — the template can't generate an event outside its own contract.
function scheduleWithinBounds(
  schedule: readonly ActivityScheduleSlot[],
  minDurationMin: number,
  maxDurationMin: number,
): boolean {
  return schedule.every(
    (slot) => slot.durationMin >= minDurationMin && slot.durationMin <= maxDurationMin,
  )
}

export const createActivitySchema = activityBaseShape
  .refine((d) => d.minDurationMin <= d.maxDurationMin, {
    message: 'minDurationMin must be <= maxDurationMin',
    path: ['minDurationMin'],
  })
  .refine((d) => scheduleWithinBounds(d.schedule, d.minDurationMin, d.maxDurationMin), {
    message: 'Each schedule slot durationMin must fall within [minDurationMin, maxDurationMin]',
    path: ['schedule'],
  })

export type CreateActivity = z.infer<typeof createActivitySchema>

export const updateActivitySchema = activityBaseShape
  .partial()
  .extend({ id: z.string().uuid() })
  .refine(
    (d) =>
      d.minDurationMin === undefined ||
      d.maxDurationMin === undefined ||
      d.minDurationMin <= d.maxDurationMin,
    {
      message: 'minDurationMin must be <= maxDurationMin',
      path: ['minDurationMin'],
    },
  )
  .refine(
    (d) => {
      if (d.schedule === undefined) return true
      if (d.minDurationMin === undefined || d.maxDurationMin === undefined) return true
      return scheduleWithinBounds(d.schedule, d.minDurationMin, d.maxDurationMin)
    },
    {
      message: 'Each schedule slot durationMin must fall within [minDurationMin, maxDurationMin]',
      path: ['schedule'],
    },
  )

export type UpdateActivity = z.infer<typeof updateActivitySchema>
