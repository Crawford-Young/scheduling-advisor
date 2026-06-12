import { z } from 'zod'

const USERNAME_MIN = 3
const USERNAME_MAX = 20

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN)
  .max(USERNAME_MAX)
  .regex(/^[a-z0-9_]+$/, 'lowercase letters, numbers, underscores only')
