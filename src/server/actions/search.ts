'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { activities, conversations, events } from '@/db/schema'
import { and, desc, eq, gt, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { globalSearchSchema, type GlobalSearchData } from '@/lib/schemas/search'
import { escapeLikePattern, searchUsers, type UserSearchResult } from '@/server/queries/profile'

const GROUP_RESULT_LIMIT = 8

type GlobalSearchResult = { data: GlobalSearchData } | { error: unknown }
type UserSearchActionResult = { data: readonly UserSearchResult[] } | { error: unknown }

export async function globalSearch(input: unknown): Promise<GlobalSearchResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }
  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }
  const parsed = globalSearchSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const userId = session.user.id
  const pattern = `%${escapeLikePattern(parsed.data.query)}%`
  const now = new Date()

  const [eventRows, activityRows, reflectionRows] = await Promise.all([
    db
      .select({
        id: events.id,
        title: events.title,
        startAt: events.startAt,
        location: events.location,
      })
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          or(
            ilike(events.title, pattern),
            ilike(events.description, pattern),
            ilike(events.location, pattern),
          ),
        ),
      )
      .orderBy(
        sql`${events.startAt} IS NULL`,
        sql`${events.startAt} < ${now}`,
        sql`ABS(EXTRACT(EPOCH FROM (${events.startAt} - ${now})))`,
      )
      .limit(GROUP_RESULT_LIMIT),
    db
      .select({ id: activities.id, title: activities.title })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          or(ilike(activities.title, pattern), ilike(activities.description, pattern)),
        ),
      )
      .orderBy(activities.title)
      .limit(GROUP_RESULT_LIMIT),
    db
      .select({ id: conversations.id, title: conversations.title })
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt),
          gt(conversations.expiresAt, now),
          isNotNull(conversations.title),
          ilike(conversations.title, pattern),
        ),
      )
      .orderBy(desc(conversations.updatedAt))
      .limit(GROUP_RESULT_LIMIT),
  ])

  return {
    data: {
      events: eventRows,
      activities: activityRows,
      // conversations.title is nullable in the schema; isNotNull(...) above
      // guarantees every row here has a real title (mirrors searchUsers'
      // `username: row.username as string` pattern in profile.ts).
      reflections: reflectionRows.map((row) => ({ id: row.id, title: row.title as string })),
    },
  }
}

export async function searchUsersGlobal(input: unknown): Promise<UserSearchActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }
  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }
  const parsed = globalSearchSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }
  return {
    data: await searchUsers(session.user.id, parsed.data.query, {
      excludeSelf: parsed.data.excludeSelf === true,
    }),
  }
}
