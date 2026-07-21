'use server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db'
import { activities, events } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { createEventSchema, updateEventSchema, deleteEventSchema } from '@/lib/schemas/event'

type EventRow = (typeof events)['$inferSelect']
type EventInsert = (typeof events)['$inferInsert']
type EventActionResult = { data: EventRow } | { error: unknown }
type DeleteEventResult = { data: { success: boolean } } | { error: unknown }

// Verifies a client-supplied activityId belongs to the calling user before it
// can be attached to an event (A9 hardening — A4 review Minor). Without this,
// a caller could attach an event to a foreign tenant's activity id: no data
// disclosure (all reads stay userId-scoped), but a dangling reference that
// silently nulls on that activity's deletion (FK `onDelete: 'set null'`).
async function activityBelongsToUser(activityId: string, userId: string): Promise<boolean> {
  const [owned] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
    .limit(1)
  return owned !== undefined
}

export async function createEvent(input: unknown): Promise<EventActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = createEventSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const data = parsed.data
  const userId = session.user.id

  if (data.activityId && !(await activityBelongsToUser(data.activityId, userId))) {
    return { error: 'Activity not found' }
  }

  // No server-side seeding here — a created event is a standalone/one-off
  // original; only generateEventsForActivity (src/server/generation.ts)
  // produces events from an activity's schedule.
  const [event] = await db
    .insert(events)
    .values({
      userId,
      activityId: data.activityId ?? null,
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      startAt: data.startAt ? new Date(data.startAt) : null,
      endAt: data.endAt ? new Date(data.endAt) : null,
      allDay: data.allDay ?? false,
      color: data.color ?? null,
    })
    .returning()

  if (!event) return { error: 'Insert failed' }

  revalidatePath('/calendar')
  revalidatePath('/activities')
  logger.info({ userId, eventId: event.id }, 'Event created')
  return { data: event }
}

export async function updateEvent(input: unknown): Promise<EventActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = updateEventSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const { id, ...fields } = parsed.data
  const userId = session.user.id

  const [current] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.userId, userId)))
    .limit(1)

  if (!current) return { error: 'Not found' }

  if (fields.activityId && !(await activityBelongsToUser(fields.activityId, userId))) {
    return { error: 'Activity not found' }
  }

  // Merge-then-validate (A9 hardening, mirrors the A3 updateActivity
  // precedent): a partial payload can enforce field-level rules but not the
  // endAt>startAt cross-field invariant it can't see — e.g. an endAt-only
  // edit could otherwise invert a previously-valid row. Merge the input over
  // the stored row and re-validate the WHOLE object against the full create
  // schema BEFORE writing.
  const merged = {
    title: fields.title !== undefined ? fields.title : current.title,
    activityId: fields.activityId !== undefined ? fields.activityId : current.activityId,
    startAt:
      fields.startAt !== undefined ? fields.startAt : (current.startAt?.toISOString() ?? null),
    endAt: fields.endAt !== undefined ? fields.endAt : (current.endAt?.toISOString() ?? null),
    allDay: fields.allDay !== undefined ? fields.allDay : current.allDay,
    color: fields.color !== undefined ? fields.color : current.color,
    location: fields.location !== undefined ? fields.location : current.location,
    description: fields.description !== undefined ? fields.description : current.description,
  }

  const revalidated = createEventSchema.safeParse(merged)
  if (!revalidated.success) return { error: revalidated.error.flatten() }

  // Events are independent originals — every field (including status/locked)
  // is updatable directly on its own row, with NO grouped-edit guard and no
  // sibling lookup. Only explicitly-provided keys are written (undefined =
  // "leave unchanged"), so a partial payload from e.g. a lock toggle never
  // clobbers unrelated fields.
  const updateValues: Partial<EventInsert> = { updatedAt: new Date() }
  if (fields.title !== undefined) updateValues.title = fields.title
  if (fields.activityId !== undefined) updateValues.activityId = fields.activityId
  if (fields.description !== undefined) updateValues.description = fields.description
  if (fields.location !== undefined) updateValues.location = fields.location
  if (fields.startAt !== undefined) {
    updateValues.startAt = fields.startAt ? new Date(fields.startAt) : null
  }
  if (fields.endAt !== undefined) {
    updateValues.endAt = fields.endAt ? new Date(fields.endAt) : null
  }
  if (fields.allDay !== undefined) updateValues.allDay = fields.allDay
  if (fields.color !== undefined) updateValues.color = fields.color
  if (fields.status !== undefined) updateValues.status = fields.status
  if (fields.locked !== undefined) updateValues.locked = fields.locked

  const [updated] = await db
    .update(events)
    .set(updateValues)
    .where(and(eq(events.id, id), eq(events.userId, userId)))
    .returning()

  if (!updated) return { error: 'Not found' }

  revalidatePath('/calendar')
  revalidatePath('/activities')
  logger.info({ userId, eventId: id }, 'Event updated')
  return { data: updated }
}

export async function deleteEvent(input: unknown): Promise<DeleteEventResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = deleteEventSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const { id } = parsed.data
  const userId = session.user.id

  // Single-row delete — events carry no grouped-delete machinery.
  const deleted = await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.userId, userId)))
    .returning({ id: events.id })

  if (deleted.length === 0) return { error: 'Not found' }

  revalidatePath('/calendar')
  revalidatePath('/activities')
  logger.info({ userId, eventId: id }, 'Event deleted')
  return { data: { success: true } }
}
