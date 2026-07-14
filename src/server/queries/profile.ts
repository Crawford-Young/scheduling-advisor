import { db } from '@/db'
import { tasks, users } from '@/db/schema'
import { and, eq, ilike, isNotNull, or } from 'drizzle-orm'
import { computeGroupStreak } from '@/lib/streaks'
import { zonedWallClock } from '@/lib/series-generation'

const SINGLE_ROW_LIMIT = 1
const MS_PER_DAY = 86_400_000
const DEFAULT_TIMEZONE = 'UTC'

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
 * Single visibility/privacy enforcement point for profile reads in this wave.
 * Every read takes `viewerId` so rows a viewer may not see never leave the
 * server.
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

export interface ProfileStreak {
  readonly title: string
  readonly current: number
  readonly best: number
}

export const PROFILE_STREAK_LIMIT = 3

interface StreakQueryRow {
  readonly recurrenceGroupId: string
  readonly title: string
  readonly startAt: Date | null
  readonly status: string
  readonly visibility: string
}

/**
 * Visibility-filtered recurrence-group streaks for a profile. A stranger
 * viewer (`viewerId !== ownerId`) only ever sees a group whose EVERY row is
 * `visibility: 'everyone'` — a group with even one `busy`/`friends`/`only_me`
 * row is hidden in its entirety (conservative leak rule). The owner sees
 * every group unfiltered. Sorted by current streak desc, tie-broken by best
 * desc, capped to `PROFILE_STREAK_LIMIT`.
 */
export async function getProfileStreaks(
  viewerId: string,
  ownerId: string,
): Promise<readonly ProfileStreak[]> {
  const rows = await db
    .select({
      recurrenceGroupId: tasks.recurrenceGroupId,
      title: tasks.title,
      startAt: tasks.startAt,
      status: tasks.status,
      visibility: tasks.visibility,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, ownerId), isNotNull(tasks.recurrenceGroupId)))

  const groups = new Map<string, StreakQueryRow[]>()
  for (const row of rows) {
    // The isNotNull filter above guarantees a non-null recurrenceGroupId on
    // every row, even though the column is nullable in the schema — same
    // reasoning as getProfileByUsername's username cast above.
    const groupId = row.recurrenceGroupId as string
    const list = groups.get(groupId) ?? []
    list.push({ ...row, recurrenceGroupId: groupId })
    groups.set(groupId, list)
  }

  const isStranger = viewerId !== ownerId
  const now = new Date()
  const streaks: ProfileStreak[] = []

  for (const groupRows of groups.values()) {
    if (isStranger && !groupRows.every((r) => r.visibility === 'everyone')) continue

    const { current, best } = computeGroupStreak(
      groupRows.map((r) => ({ startAt: r.startAt, status: r.status })),
      now,
    )
    const latestRow = groupRows.reduce((latest, row) => {
      const rowTime = row.startAt?.getTime() ?? Number.NEGATIVE_INFINITY
      const latestTime = latest.startAt?.getTime() ?? Number.NEGATIVE_INFINITY
      return rowTime > latestTime ? row : latest
    })
    streaks.push({ title: latestRow.title, current, best })
  }

  streaks.sort((a, b) => b.current - a.current || b.best - a.best)
  return streaks.slice(0, PROFILE_STREAK_LIMIT)
}

export interface ProfileStats {
  readonly completionsThisWeek: number
  readonly completionsThisMonth: number
  readonly completionsAllTime: number
}

interface CompletedRow {
  readonly id: string
  readonly startAt: Date | null
  readonly visibility: string
}

// Calendar-day index (days since UTC epoch) of `d`'s LOCAL wall-clock date in
// `timeZone` — reuses series-generation's zonedWallClock rather than
// duplicating the Intl offset math (mirrors streaks.ts's private helper).
function zonedDayIndex(timeZone: string, d: Date): number {
  const wc = zonedWallClock(timeZone, d)
  return Date.UTC(wc.year, wc.month, wc.day) / MS_PER_DAY
}

/**
 * Visibility-filtered completion stats for a profile, windowed in the
 * OWNER's timezone. Counts are derived via per-row date-part comparison
 * (rather than instant-range math), which sidesteps DST instant conversion
 * entirely.
 */
export async function getProfileStats(viewerId: string, ownerId: string): Promise<ProfileStats> {
  const ownerRows = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(SINGLE_ROW_LIMIT)
  const timeZone = ownerRows[0]?.timezone ?? DEFAULT_TIMEZONE

  const completedRows: readonly CompletedRow[] = await db
    .select({ id: tasks.id, startAt: tasks.startAt, visibility: tasks.visibility })
    .from(tasks)
    .where(and(eq(tasks.userId, ownerId), eq(tasks.status, 'completed')))

  const isStranger = viewerId !== ownerId
  const visibleRows = isStranger
    ? completedRows.filter((r) => r.visibility === 'everyone')
    : completedRows

  const now = new Date()
  const todayIdx = zonedDayIndex(timeZone, now)
  const nowWc = zonedWallClock(timeZone, now)
  const weekday = new Date(Date.UTC(nowWc.year, nowWc.month, nowWc.day)).getUTCDay()
  const sundayIdx = todayIdx - weekday

  let completionsThisWeek = 0
  let completionsThisMonth = 0
  for (const row of visibleRows) {
    if (row.startAt === null) continue
    const rowWc = zonedWallClock(timeZone, row.startAt)
    const rowIdx = Date.UTC(rowWc.year, rowWc.month, rowWc.day) / MS_PER_DAY
    if (rowIdx >= sundayIdx && rowIdx <= todayIdx) completionsThisWeek += 1
    if (rowWc.year === nowWc.year && rowWc.month === nowWc.month) completionsThisMonth += 1
  }

  return {
    completionsThisWeek,
    completionsThisMonth,
    completionsAllTime: visibleRows.length,
  }
}
