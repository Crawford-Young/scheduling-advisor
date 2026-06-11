import { auth } from '@/auth'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function getUserTasks() {
  const session = await auth()
  if (!session?.user?.id) return []
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, session.user.id))
    .orderBy(desc(tasks.createdAt))
}
