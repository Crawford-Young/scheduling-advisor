'use server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db'
import { activities, events } from '@/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { createEventSchema } from '@/lib/schemas/event'
import { z } from 'zod'

type EventRow = (typeof events)['$inferSelect']
type CreateEventsResult = { data: EventRow[] } | { error: unknown }

// Cap a single bulk call — the mass tool is a convenience for "schedule this a
// few times", not a bulk-import endpoint. Kept module-private ('use server'
// files may export only async functions).
const MAX_BULK_EVENTS = 50

// Each element reuses the same validated one-off event contract as createEvent;
// the batch is an array of INDEPENDENT originals — there is deliberately no
// series/recurrence/group linkage between them (that model is dead).
const createEventsSchema = z.object({
  events: z.array(createEventSchema).min(1).max(MAX_BULK_EVENTS),
})

/**
 * Chat mass-schedule tool backing: insert N independent event rows in one call.
 * Identity is derived from `auth()` (never a parameter) and every inserted row
 * is stamped with that userId — this is a client-callable POST.
 */
export async function createEvents(input: unknown): Promise<CreateEventsResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = createEventsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const userId = session.user.id

  // Verify every referenced activityId belongs to the caller before
  // inserting any row (A9 hardening — mirrors the same check in
  // src/server/actions/events.ts). A foreign-tenant id would otherwise
  // silently attach, then dangle-orphan on that activity's deletion (FK is
  // `onDelete: 'set null'`). Reject the WHOLE batch on any miss — this is a
  // single insert statement, not a partial-success operation.
  const activityIds = [
    ...new Set(
      parsed.data.events
        .map((event) => event.activityId)
        .filter((id): id is string => id !== null && id !== undefined),
    ),
  ]
  if (activityIds.length > 0) {
    const owned = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.userId, userId), inArray(activities.id, activityIds)))
    const ownedIds = new Set(owned.map((row) => row.id))
    if (!activityIds.every((activityId) => ownedIds.has(activityId))) {
      return { error: 'Activity not found' }
    }
  }

  const rows = parsed.data.events.map((event) => ({
    userId,
    activityId: event.activityId ?? null,
    title: event.title,
    description: event.description ?? null,
    location: event.location ?? null,
    startAt: event.startAt ? new Date(event.startAt) : null,
    endAt: event.endAt ? new Date(event.endAt) : null,
    allDay: event.allDay ?? false,
    color: event.color ?? null,
  }))

  const inserted = await db.insert(events).values(rows).returning()

  revalidatePath('/calendar')
  revalidatePath('/activities')
  logger.info({ userId, count: inserted.length }, 'Events created (bulk)')
  return { data: inserted }
}
