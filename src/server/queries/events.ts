import { auth } from '@/auth'
import { db } from '@/db'
import { events } from '@/db/schema'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'

export type EventRowDb = (typeof events)['$inferSelect']

export async function getUserEvents(): Promise<EventRowDb[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  return db
    .select()
    .from(events)
    .where(eq(events.userId, session.user.id))
    .orderBy(desc(events.createdAt))
}

/**
 * Standalone events for the user — no linked activity AND no linked series
 * (`activityId IS NULL AND seriesId IS NULL`), earliest first, including past
 * events. Occurrences generated from a standalone series carry `seriesId` and
 * belong to the "Repeating events" section instead, not here.
 */
export async function getStandaloneEvents(): Promise<EventRowDb[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  return db
    .select()
    .from(events)
    .where(
      and(eq(events.userId, session.user.id), isNull(events.activityId), isNull(events.seriesId)),
    )
    .orderBy(asc(events.startAt))
}
