import { auth } from '@/auth'
import { db } from '@/db'
import { checkIns } from '@/db/schema'
import { eq, desc, isNull, and } from 'drizzle-orm'

export async function getUserCheckIns(limit = 20) {
  const session = await auth()
  if (!session?.user?.id) return []
  return db
    .select()
    .from(checkIns)
    .where(eq(checkIns.userId, session.user.id))
    .orderBy(desc(checkIns.scheduledAt))
    .limit(limit)
}

export async function getPendingCheckIn() {
  const session = await auth()
  if (!session?.user?.id) return null
  const [checkIn] = await db
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.userId, session.user.id), isNull(checkIns.completedAt)))
    .orderBy(checkIns.scheduledAt)
    .limit(1)
  return checkIn ?? null
}
