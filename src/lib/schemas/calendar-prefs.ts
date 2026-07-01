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

export const updateWakeSleepSchema = z
  .object({
    workingHoursStart: z.number().int().min(0).max(23),
    workingHoursEnd: z.number().int().min(1).max(24),
  })
  .refine((d) => d.workingHoursEnd > d.workingHoursStart, {
    message: 'workingHoursEnd must be after workingHoursStart',
  })

export type UpdateWakeSleep = z.infer<typeof updateWakeSleepSchema>
