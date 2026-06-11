import { z } from 'zod'

export const updateActivitySettingsSchema = z
  .object({
    taskId: z.string().uuid(),
    activityType: z.enum(['solo', 'group']),
    visibility: z.enum(['everyone', 'friends', 'busy', 'only_me']),
    joinability: z.enum(['open', 'request', 'closed']).optional(),
    maxParticipants: z.number().int().min(1).optional(),
  })
  .refine((v) => !(v.activityType === 'solo' && v.joinability !== undefined), {
    message: 'Solo activities cannot have joinability set',
    path: ['joinability'],
  })
  .refine(
    (v) =>
      !(
        v.activityType === 'group' &&
        (v.visibility === 'busy' || v.visibility === 'only_me') &&
        v.joinability !== undefined
      ),
    {
      message: 'Group activities with busy/only_me visibility cannot have joinability',
      path: ['joinability'],
    },
  )

export type UpdateActivitySettings = z.infer<typeof updateActivitySettingsSchema>
