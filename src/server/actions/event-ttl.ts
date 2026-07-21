'use server'
import * as Sentry from '@sentry/nextjs'
import { auth } from '@/auth'
import { db } from '@/db'
import { events, calendarPrefs } from '@/db/schema'
import { and, eq, ne, lt, isNull, isNotNull } from 'drizzle-orm'
import { logger } from '@/lib/logger'

const MS_PER_DAY = 24 * 60 * 60 * 1000

type DeleteExpiredEventsResult = { data: { deleted: number } } | { error: unknown }

/**
 * Deletes the current user's still-pending, STANDALONE events (`activityId
 * IS NULL`) whose endAt is more than calendarPrefs.ttlDays days in the past.
 * Completed events and any event generated from an activity (recurring
 * pattern) are never touched — TTL applies to standalone events only.
 */
export async function deleteExpiredEvents(): Promise<DeleteExpiredEventsResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const [prefs] = await db
    .select()
    .from(calendarPrefs)
    .where(eq(calendarPrefs.userId, session.user.id))

  if (!prefs || prefs.ttlDays === null) return { data: { deleted: 0 } }

  const cutoff = new Date(Date.now() - prefs.ttlDays * MS_PER_DAY)

  const deleted = await db
    .delete(events)
    .where(
      and(
        eq(events.userId, session.user.id),
        isNull(events.activityId),
        ne(events.status, 'completed'),
        isNotNull(events.endAt),
        lt(events.endAt, cutoff),
      ),
    )
    .returning({ id: events.id })

  logger.info({ userId: session.user.id, deleted: deleted.length }, 'Expired events deleted (TTL)')

  return { data: { deleted: deleted.length } }
}

/**
 * Read-path-safe wrapper: never throws. Failures are reported to Sentry so a
 * broken TTL sweep cannot crash a page render.
 */
export async function safeDeleteExpiredEvents(): Promise<void> {
  try {
    await deleteExpiredEvents()
  } catch (err) {
    Sentry.captureException(err)
  }
}
