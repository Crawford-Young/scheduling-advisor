'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { calendarPrefs } from '@/db/schema'
import { updateCalendarPrefsSchema, updateWakeSleepSchema } from '@/lib/schemas/calendar-prefs'

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

export async function setCalendarWindow(input: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const parsed = updateWakeSleepSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const [prefs] = await db
    .insert(calendarPrefs)
    .values({
      userId: session.user.id,
      workingHoursStart: parsed.data.workingHoursStart,
      workingHoursEnd: parsed.data.workingHoursEnd,
      ...(parsed.data.dayOverrides !== undefined && { dayOverrides: parsed.data.dayOverrides }),
      ...(parsed.data.use24h !== undefined && { use24h: parsed.data.use24h }),
    })
    .onConflictDoUpdate({
      target: calendarPrefs.userId,
      set: {
        workingHoursStart: parsed.data.workingHoursStart,
        workingHoursEnd: parsed.data.workingHoursEnd,
        ...(parsed.data.dayOverrides !== undefined && { dayOverrides: parsed.data.dayOverrides }),
        ...(parsed.data.use24h !== undefined && { use24h: parsed.data.use24h }),
        updatedAt: new Date(),
      },
    })
    .returning()

  return { data: prefs }
}
