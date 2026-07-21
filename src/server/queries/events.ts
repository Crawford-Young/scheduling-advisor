import { auth } from '@/auth'
import { db } from '@/db'
import { events } from '@/db/schema'
import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm'

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

/** Standalone (activityId IS NULL) events still due or in progress, earliest first. */
export async function getStandaloneUpcomingEvents(): Promise<EventRowDb[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const now = new Date()
  return db
    .select()
    .from(events)
    .where(
      and(eq(events.userId, session.user.id), isNull(events.activityId), gte(events.endAt, now)),
    )
    .orderBy(asc(events.startAt))
}
