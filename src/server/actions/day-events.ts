'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { DayEvent } from '@/components/chat/day-proposal-preview'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Returns the authenticated user's scheduled tasks whose LOCAL day of `startAt`
 * matches `date` (YYYY-MM-DD). Day membership uses local `Date` getters to match
 * the calendar's local-wall-clock invariant (CI runs UTC; local reads never use
 * ISO substrings). Unauthenticated or malformed input yields an empty array so
 * the popup preview degrades silently and never blocks approval.
 */
export async function getEventsForDay(date: string): Promise<readonly DayEvent[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const parsed = dateSchema.safeParse(date)
  if (!parsed.success) return []

  const [year, month, day] = date.split('-').map(Number)

  const rows = await db.select().from(tasks).where(eq(tasks.userId, session.user.id))

  return rows
    .filter((row): row is typeof row & { startAt: Date } => row.startAt !== null)
    .filter((row) => {
      const start = new Date(row.startAt)
      return (
        start.getFullYear() === year && start.getMonth() === month! - 1 && start.getDate() === day
      )
    })
    .map((row) => ({
      id: row.id,
      title: row.title,
      start: row.startAt.toISOString(),
      end: (row.endAt ?? row.startAt).toISOString(),
    }))
}
