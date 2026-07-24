import { db } from '@/db'
import { eventSeries } from '@/db/schema'
import { eq } from 'drizzle-orm'

export type SeriesRowDb = (typeof eventSeries)['$inferSelect']

/**
 * All `event_series` rows owned by `userId` — both activity-linked and
 * standalone. Caller-scoped (mirrors `profile.ts`'s viewer-parameter
 * convention) rather than internally deriving the user from `auth()`, since
 * this read composes into `/activities`' already-auth-checked parallel query
 * batch alongside `getUserActivities`/`getUserEvents`.
 */
export async function getSeriesForUser(userId: string): Promise<SeriesRowDb[]> {
  return db.select().from(eventSeries).where(eq(eventSeries.userId, userId))
}
