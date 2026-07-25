import { db } from '@/db'
import { events, users } from '@/db/schema'
import { and, eq, gte, ilike, isNotNull, lt, ne, or } from 'drizzle-orm'

const SINGLE_ROW_LIMIT = 1
const WEEK_DAYS = 7

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
 * Identity + search were the only surfaces here since A8 (activity-model
 * wave), which trimmed the old tasks-backed streaks/stats/activities/
 * week-view sections. The visibility-w1 wave reintroduces a week view
 * (`getProfileWeekEvents` below), backed by the new events/event_series
 * `visibility` column rather than the retired `tasks` model.
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

type EventRowDb = typeof events.$inferSelect

export type ProfileWeekEvent =
  | {
      readonly kind: 'public'
      readonly id: string
      readonly title: string
      readonly startAt: Date
      readonly endAt: Date
      readonly allDay: boolean
      readonly color: string | null
      readonly location: string | null
      readonly description: string | null
      readonly completed: boolean
    }
  | { readonly kind: 'busy'; readonly id: string; readonly startAt: Date; readonly endAt: Date }

/**
 * Builds the full public shape FIELD-BY-FIELD — never spread from the db
 * row — per the V6 threat model: this module is the single enforcement
 * point for data about another user's events leaving the server.
 */
function toPublicWeekEvent(row: EventRowDb): ProfileWeekEvent {
  return {
    kind: 'public',
    id: row.id,
    title: row.title,
    // Guaranteed non-null by the query's isNotNull(startAt/endAt) predicates.
    startAt: row.startAt as Date,
    endAt: row.endAt as Date,
    allDay: row.allDay,
    color: row.color,
    location: row.location,
    description: row.description,
    completed: row.status === 'completed',
  }
}

/**
 * Sanitizes a `busy`-visibility row down to the three timing fields a
 * non-owner viewer may see — constructed field-by-field, NEVER spread from
 * the row, so title/location/description/color/activityId never leave the
 * server for a row the viewer isn't fully allowed to see.
 */
function toBusyWeekEvent(row: EventRowDb): ProfileWeekEvent {
  return {
    kind: 'busy',
    id: row.id,
    startAt: row.startAt as Date,
    endAt: row.endAt as Date,
  }
}

/**
 * Viewer-scoped, server-sanitized week of a profile's events — the ONLY
 * query in the app that returns another user's events. Non-owner viewers
 * never receive `private` rows (excluded in the WHERE clause, not filtered
 * in JS after the fact) and only ever see `busy` rows in their sanitized
 * shape. The owner sees every row, including their own `private` ones, all
 * mapped to the full public shape.
 */
export async function getProfileWeekEvents(
  viewerId: string,
  profileUserId: string,
  weekStart: string,
): Promise<readonly ProfileWeekEvent[]> {
  // Local Date constructor per the local-wall-clock invariant — never a UTC
  // ISO slice. `weekStart` is a validated 'YYYY-MM-DD' from resolveWeekStart.
  const [year, month, day] = weekStart.split('-').map(Number)
  const from = new Date(year!, month! - 1, day!)
  const to = new Date(year!, month! - 1, day! + WEEK_DAYS)
  const isOwner = viewerId === profileUserId

  const conditions = [
    eq(events.userId, profileUserId),
    gte(events.startAt, from),
    lt(events.startAt, to),
    isNotNull(events.startAt),
    isNotNull(events.endAt),
  ]
  if (!isOwner) conditions.push(ne(events.visibility, 'private'))

  const rows = await db
    .select()
    .from(events)
    .where(and(...conditions))

  return rows.map((row) =>
    isOwner || row.visibility === 'public' ? toPublicWeekEvent(row) : toBusyWeekEvent(row),
  )
}
