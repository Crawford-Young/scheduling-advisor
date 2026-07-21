import { db } from '@/db'
import { users } from '@/db/schema'
import { and, eq, ilike, isNotNull, or } from 'drizzle-orm'

const SINGLE_ROW_LIMIT = 1

export interface ProfileIdentity {
  readonly id: string
  readonly name: string | null
  readonly username: string
  readonly image: string | null
  readonly bio: string | null
  readonly createdAt: Date
  readonly isOwner: boolean
}

/**
 * Single visibility/privacy enforcement point for profile reads. Every read
 * takes `viewerId` so rows a viewer may not see never leave the server.
 *
 * Trimmed to identity + search only (A8, activity-model wave): the
 * tasks-backed streaks/stats/activities/week-view surfaces were removed
 * along with the `tasks` table. Profile v2 (activities/events + a visibility
 * model) is a queued follow-up wave.
 */
export async function getProfileByUsername(
  viewerId: string,
  username: string,
): Promise<ProfileIdentity | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(SINGLE_ROW_LIMIT)
  const row = rows[0]
  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    // The where-equality on users.username guarantees a non-null hit here,
    // even though the column is nullable in the schema.
    username: row.username as string,
    image: row.image,
    bio: row.bio,
    createdAt: row.createdAt,
    isOwner: row.id === viewerId,
  }
}

export interface UserSearchResult {
  readonly username: string
  readonly name: string | null
  readonly image: string | null
}

export const SEARCH_RESULT_LIMIT = 20

const LIKE_BACKSLASH_PATTERN = /\\/g
const LIKE_PERCENT_PATTERN = /%/g
const LIKE_UNDERSCORE_PATTERN = /_/g

/**
 * Escapes SQL LIKE wildcards (`\`, `%`, `_`) so raw user input can be safely
 * embedded in an `ilike` pattern. Backslash must be escaped first, otherwise
 * the backslashes introduced by escaping `%`/`_` would themselves be escaped.
 */
export function escapeLikePattern(input: string): string {
  return input
    .replace(LIKE_BACKSLASH_PATTERN, '\\\\')
    .replace(LIKE_PERCENT_PATTERN, '\\%')
    .replace(LIKE_UNDERSCORE_PATTERN, '\\_')
}

export async function searchUsers(
  viewerId: string,
  q: string,
): Promise<readonly UserSearchResult[]> {
  // No viewer-specific filtering applies to search results yet (viewer may
  // appear in their own results, no self-exclusion) — the parameter is kept
  // on the signature per this module's single-visibility-enforcement-point
  // contract so later tasks/reviewers can add viewer-scoped filtering here
  // without an API change.
  void viewerId

  const trimmed = q.trim()
  if (trimmed === '') return []

  const pattern = `%${escapeLikePattern(trimmed)}%`

  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        isNotNull(users.username),
        or(ilike(users.username, pattern), ilike(users.name, pattern)),
      ),
    )
    .limit(SEARCH_RESULT_LIMIT)

  return rows.map((row) => ({
    username: row.username as string,
    name: row.name,
    image: row.image,
  }))
}
