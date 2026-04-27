import { auth } from '@/auth'
import { db } from '@/db'
import { calendarPrefs } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function getCalendarPrefs() {
  const session = await auth()
  if (!session?.user?.id) return null
  const [prefs] = await db
    .select()
    .from(calendarPrefs)
    .where(eq(calendarPrefs.userId, session.user.id))
  return prefs ?? null
}
