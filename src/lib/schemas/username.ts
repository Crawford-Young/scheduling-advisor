import { z } from 'zod'

const USERNAME_MIN = 3
export const USERNAME_MAX = 20

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN)
  .max(USERNAME_MAX)
  .regex(/^[a-z0-9_]+$/, 'lowercase letters, numbers, underscores only')

export function sanitizeUsernameInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, USERNAME_MAX)
}
