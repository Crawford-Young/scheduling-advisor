import { auth } from '@/auth'
import { db } from '@/db'
import { activities } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export type ActivityRowDb = (typeof activities)['$inferSelect']

export async function getUserActivities(): Promise<ActivityRowDb[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  return db
    .select()
    .from(activities)
    .where(eq(activities.userId, session.user.id))
    .orderBy(desc(activities.createdAt))
}
