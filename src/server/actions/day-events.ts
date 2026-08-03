'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { events } from '@/db/schema'
import { localWeekBounds } from '@/lib/weekly-fit'
import { and, eq, gte, lt } from 'drizzle-orm'
import { z } from 'zod'
import type { DayEvent } from '@/components/chat/day-proposal-preview'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Local midnight of the next calendar day, one day past the queried day. */
const NEXT_DAY_OFFSET = 1

interface EventRow {
  readonly id: string
  readonly title: string
  readonly startAt: Date | null
  readonly endAt: Date | null
}

function toDayEvent(row: EventRow & { readonly startAt: Date }): DayEvent {
  return {
    id: row.id,
    title: row.title,
    start: row.startAt.toISOString(),
    end: (row.endAt ?? row.startAt).toISOString(),
  }
}

/**
 * Returns the authenticated user's events whose LOCAL day of `startAt` matches
 * `date` (YYYY-MM-DD). Day membership uses local `Date` getters to match the
 * calendar's local-wall-clock invariant (CI runs UTC; local reads never use
 * ISO substrings). The query is also SQL range-predicated to local midnight
 * through the next local midnight (`gte`/`lt` on `startAt`), so the JS
 * membership check below runs as a belt-and-suspenders guard on top of it,
 * not as the sole filter. Unauthenticated or malformed input yields an empty
 * array so the popup preview degrades silently and never blocks approval.
 */
export async function getEventsForDay(date: string): Promise<readonly DayEvent[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const parsed = dateSchema.safeParse(date)
  if (!parsed.success) return []

  const [year, month, day] = date.split('-').map(Number)
  const rangeStart = new Date(year!, month! - 1, day!)
  const rangeEnd = new Date(year!, month! - 1, day! + NEXT_DAY_OFFSET)

  const rows = (await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, session.user.id),
        gte(events.startAt, rangeStart),
        lt(events.startAt, rangeEnd),
      ),
    )) as readonly EventRow[]

  return rows
    .filter((row): row is EventRow & { readonly startAt: Date } => row.startAt !== null)
    .filter((row) => {
      const start = new Date(row.startAt)
      return (
        start.getFullYear() === year && start.getMonth() === month! - 1 && start.getDate() === day
      )
    })
    .map(toDayEvent)
}

/**
 * Returns the authenticated user's events across all seven local days of the
 * week containing `weekStartDate` (YYYY-MM-DD), in one call — the week-strip
 * preview's single round trip. Range bounds are built from local `Date`
 * constructor parts, then floored to the local Sunday-through-next-Sunday
 * window via `localWeekBounds` (never `new Date(weekStartDate)`, which parses
 * UTC midnight and would shift the window for non-UTC users). `getEventsForDay`'s
 * contract is unchanged by this addition — same input, same output shape.
 * Unauthenticated or malformed input yields an empty array, same degrade-
 * silently discipline as `getEventsForDay`.
 */
export async function getEventsForWeek(weekStartDate: string): Promise<readonly DayEvent[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const parsed = dateSchema.safeParse(weekStartDate)
  if (!parsed.success) return []

  const [year, month, day] = weekStartDate.split('-').map(Number)
  const { start, end } = localWeekBounds(new Date(year!, month! - 1, day!))

  const rows = (await db
    .select()
    .from(events)
    .where(
      and(eq(events.userId, session.user.id), gte(events.startAt, start), lt(events.startAt, end)),
    )) as readonly EventRow[]

  return rows
    .filter((row): row is EventRow & { readonly startAt: Date } => row.startAt !== null)
    .map(toDayEvent)
}
