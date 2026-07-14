import { z } from 'zod'

export const PROFILE_NAME_MAX = 50
export const PROFILE_BIO_MAX = 280

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(PROFILE_NAME_MAX),
  bio: z
    .string()
    .trim()
    .max(PROFILE_BIO_MAX)
    .transform((v) => (v === '' ? null : v)),
})

export type UpdateProfileInput = z.input<typeof updateProfileSchema>
