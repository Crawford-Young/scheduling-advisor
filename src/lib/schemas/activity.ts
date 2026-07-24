import { z } from 'zod'

const MAX_TITLE_LENGTH = 200
const MAX_COLOR_LENGTH = 32
const MAX_DESCRIPTION_LENGTH = 2000
const MAX_LOCATION_LENGTH = 200
const MIN_WEEKLY_TARGET_SESSIONS = 1

const activityBaseShape = z.object({
  title: z.string().min(1, 'Title required').max(MAX_TITLE_LENGTH),
  color: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).nullable().optional(),
  defaultLocation: z.string().max(MAX_LOCATION_LENGTH).nullable().optional(),
  minDurationMin: z.number().int().positive(),
  maxDurationMin: z.number().int().positive(),
  weeklyTargetSessions: z.number().int().min(MIN_WEEKLY_TARGET_SESSIONS),
})

export const createActivitySchema = activityBaseShape.refine(
  (d) => d.minDurationMin <= d.maxDurationMin,
  {
    message: 'minDurationMin must be <= maxDurationMin',
    path: ['minDurationMin'],
  },
)

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

export type UpdateActivity = z.infer<typeof updateActivitySchema>
