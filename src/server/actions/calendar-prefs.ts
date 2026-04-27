'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { calendarPrefs } from '@/db/schema'
import { updateCalendarPrefsSchema } from '@/lib/schemas/calendar-prefs'

export async function upsertCalendarPrefs(input: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const parsed = updateCalendarPrefsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const [prefs] = await db
    .insert(calendarPrefs)
    .values({ userId: session.user.id, ...parsed.data })
    .onConflictDoUpdate({
      target: calendarPrefs.userId,
      set: { ...parsed.data, updatedAt: new Date() },
    })
    .returning()

  return { data: prefs }
}
