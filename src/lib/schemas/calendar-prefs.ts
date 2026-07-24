import { z } from 'zod'
import { visibilitySchema } from './visibility'

// Wake/sleep windows are stored as minutes-since-midnight.
// Start is inclusive (0 = 00:00), end is exclusive up to 1440 (= 24:00).
const MIN_MINUTES = 0
const MAX_START_MINUTES = 1439
const MIN_END_MINUTES = 1
const MAX_END_MINUTES = 1440

// TTL auto-delete window, in whole days (null = disabled).
const MIN_TTL_DAYS = 1
const MAX_TTL_DAYS = 365

export const updateCalendarPrefsSchema = z
  .object({
    workingHoursStart: z.number().int().min(MIN_MINUTES).max(MAX_START_MINUTES),
    workingHoursEnd: z.number().int().min(MIN_END_MINUTES).max(MAX_END_MINUTES),
    maxDailyTaskMinutes: z.number().int().min(15).max(480),
  })
  .refine((d) => d.workingHoursEnd > d.workingHoursStart, {
    message: 'workingHoursEnd must be after workingHoursStart',
  })

export type UpdateCalendarPrefs = z.infer<typeof updateCalendarPrefsSchema>

const dayOverrideSchema = z
  .object({
    wake: z.number().int().min(MIN_MINUTES).max(MAX_START_MINUTES),
    sleep: z.number().int().min(MIN_END_MINUTES).max(MAX_END_MINUTES),
  })
  .refine((d) => d.sleep > d.wake, { message: 'sleep must be after wake' })

export const dayOverridesSchema = z.record(
  z.enum(['0', '1', '2', '3', '4', '5', '6']),
  dayOverrideSchema,
)

export type CalendarDayOverrides = z.infer<typeof dayOverridesSchema>

export const updateWakeSleepSchema = z
  .object({
    workingHoursStart: z.number().int().min(MIN_MINUTES).max(MAX_START_MINUTES),
    workingHoursEnd: z.number().int().min(MIN_END_MINUTES).max(MAX_END_MINUTES),
    dayOverrides: dayOverridesSchema.optional(),
    use24h: z.boolean().optional(),
    ttlDays: z.number().int().min(MIN_TTL_DAYS).max(MAX_TTL_DAYS).nullable().optional(),
    defaultVisibility: visibilitySchema.optional(),
  })
  .refine((d) => d.workingHoursEnd > d.workingHoursStart, {
    message: 'workingHoursEnd must be after workingHoursStart',
  })

export type UpdateWakeSleep = z.infer<typeof updateWakeSleepSchema>
