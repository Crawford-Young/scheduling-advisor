import { z } from 'zod'

export const updateCalendarPrefsSchema = z
  .object({
    workingHoursStart: z.number().int().min(0).max(23),
    workingHoursEnd: z.number().int().min(1).max(24),
    maxDailyTaskMinutes: z.number().int().min(15).max(480),
  })
  .refine((d) => d.workingHoursEnd > d.workingHoursStart, {
    message: 'workingHoursEnd must be after workingHoursStart',
  })

export type UpdateCalendarPrefs = z.infer<typeof updateCalendarPrefsSchema>

const dayOverrideSchema = z
  .object({ wake: z.number().int().min(0).max(23), sleep: z.number().int().min(1).max(24) })
  .refine((d) => d.sleep > d.wake, { message: 'sleep must be after wake' })

export const dayOverridesSchema = z.record(
  z.enum(['0', '1', '2', '3', '4', '5', '6']),
  dayOverrideSchema,
)

export type CalendarDayOverrides = z.infer<typeof dayOverridesSchema>

export const updateWakeSleepSchema = z
  .object({
    workingHoursStart: z.number().int().min(0).max(23),
    workingHoursEnd: z.number().int().min(1).max(24),
    dayOverrides: dayOverridesSchema.optional(),
    use24h: z.boolean().optional(),
  })
  .refine((d) => d.workingHoursEnd > d.workingHoursStart, {
    message: 'workingHoursEnd must be after workingHoursStart',
  })

export type UpdateWakeSleep = z.infer<typeof updateWakeSleepSchema>
