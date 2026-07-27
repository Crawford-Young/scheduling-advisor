import { USERNAME_MAX, USERNAME_MIN, USERNAME_RENAME_WINDOW_DAYS } from '@/lib/schemas/username'

// Local aliases keep the template literals below inside printWidth 100.
const RANGE = `${USERNAME_MIN}–${USERNAME_MAX}`
const WINDOW = USERNAME_RENAME_WINDOW_DAYS

const TOO_MANY_REQUESTS = 'Too many attempts — wait a moment and try again.'
const UNAVAILABLE = "That username isn't available. Try another."
const RENAME_LIMIT = `You can only change your username once every ${WINDOW} days.`
const INVALID_FORMAT = `${RANGE} characters: lowercase letters, numbers, underscores only.`

/** Shown when the action threw, or returned an error the user never sees. */
export const USERNAME_ERROR_FALLBACK = 'Could not save username — try again.'

/**
 * Maps a `setUsername` error value to user-facing copy. Reserved and taken
 * deliberately collapse to the SAME string — distinguishing them would turn the
 * reserved list into an enumerable oracle.
 */
export function mapUsernameError(error: unknown): string {
  if (error === 'Too many requests') return TOO_MANY_REQUESTS
  if (error === 'Username unavailable') return UNAVAILABLE
  if (error === 'Rename limit reached') return RENAME_LIMIT
  if (typeof error === 'object' && error !== null && 'formErrors' in error) return INVALID_FORMAT
  return USERNAME_ERROR_FALLBACK
}
