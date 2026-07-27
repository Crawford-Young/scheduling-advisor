import { z } from 'zod'

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Rename throttle. The first-ever set is never gated (there is no prior
// username to measure against) but it DOES stamp users.lastUsernameChangeAt,
// so set #2 onward waits out the full window — the STRICT rule, approved
// 2026-07-27. A typo fixed moments after the first set waits the same 14 days.
export const USERNAME_RENAME_WINDOW_DAYS = 14
export const USERNAME_RENAME_WINDOW_MS = USERNAME_RENAME_WINDOW_DAYS * MS_PER_DAY

// Impersonation / brand-squatting blocklist. NOT a routing concern: profiles
// live at /u/<username>, never at a bare /<username>, so a reserved name can
// never collide with an app route — a future reader must not "fix" this list
// toward route names. Matching is EXACT only: usernames are already
// constrained to 3-20 lowercase [a-z0-9_], and substring matching would
// false-positive on legitimate names like `adminlover` or `notarobot`.
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // Staff / role impersonation
  'admin',
  'administrator',
  'root',
  'system',
  'staff',
  'moderator',
  'mod',
  'support',
  'security',
  'official',
  'verified',
  // Brand squatting. 'cy' is shorter than USERNAME_MIN, so usernameSchema
  // rejects it before this set is ever consulted — kept verbatim from the
  // approved list rather than silently trimmed.
  'cybond',
  'cyrein',
  'cy',
  // Placeholder / null-ish identities
  'anonymous',
  'deleted',
  'unknown',
  'null',
  'undefined',
  // Generic account words
  'test',
  'username',
  'user',
  'guest',
  'owner',
  'superuser',
  'webmaster',
  // Company / policy mailboxes
  'contact',
  'info',
  'billing',
  'abuse',
  'legal',
  'privacy',
  'terms',
  'tos',
  'about',
  'help',
  'feedback',
  // App words — blocked for impersonation, NOT for routing (see note above)
  'api',
  'settings',
])

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN)
  .max(USERNAME_MAX)
  .regex(/^[a-z0-9_]+$/, 'lowercase letters, numbers, underscores only')

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username)
}

export function sanitizeUsernameInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, USERNAME_MAX)
}
