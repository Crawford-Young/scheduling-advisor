'use server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db'
import { activities, events, eventSeries } from '@/db/schema'
import { and, eq, gt } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { createActivitySchema, updateActivitySchema } from '@/lib/schemas/activity'
import { z } from 'zod'

type ActivityRow = (typeof activities)['$inferSelect']
type ActivityActionResult = { data: ActivityRow } | { error: unknown }
type DeleteActivityResult = { data: { success: boolean } } | { error: unknown }

// Not exported — 'use server' files may only export async functions; this
// stays module-private.
const deleteActivitySchema = z.object({ id: z.string().uuid() })

export async function createActivity(input: unknown): Promise<ActivityActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = createActivitySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const data = parsed.data
  const userId = session.user.id

  const [activity] = await db
    .insert(activities)
    .values({
      userId,
      title: data.title,
      color: data.color ?? null,
      description: data.description ?? null,
      defaultLocation: data.defaultLocation ?? null,
      minDurationMin: data.minDurationMin,
      maxDurationMin: data.maxDurationMin,
      weeklyTargetSessions: data.weeklyTargetSessions,
      // schedule/timeZone columns were dropped from `activities` in migration
      // 0022 (event-series wave, A9) — activities are metadata-only templates
      // now. A legacy client payload's schedule/timeZone keys are stripped by
      // createActivitySchema and never reach this insert.
    })
    .returning()

  if (!activity) return { error: 'Insert failed' }

  revalidatePath('/calendar')
  revalidatePath('/activities')
  logger.info({ userId, activityId: activity.id }, 'Activity created')
  return { data: activity }
}

export async function updateActivity(input: unknown): Promise<ActivityActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = updateActivitySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const { id, ...fields } = parsed.data
  const userId = session.user.id

  const [current] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.userId, userId)))
    .limit(1)

  if (!current) return { error: 'Not found' }

  // Fetch-merge-revalidate (A1-review requirement): a partial schema can't
  // enforce the cross-field [min,max]-vs-schedule invariant — merge the
  // input over the stored row and re-validate the WHOLE object against the
  // full create schema. Schedule editing no longer regenerates events (A3) —
  // activities are metadata-only templates going forward (A5).
  const merged = {
    title: fields.title !== undefined ? fields.title : current.title,
    color: fields.color !== undefined ? fields.color : current.color,
    description: fields.description !== undefined ? fields.description : current.description,
    defaultLocation:
      fields.defaultLocation !== undefined ? fields.defaultLocation : current.defaultLocation,
    minDurationMin:
      fields.minDurationMin !== undefined ? fields.minDurationMin : current.minDurationMin,
    maxDurationMin:
      fields.maxDurationMin !== undefined ? fields.maxDurationMin : current.maxDurationMin,
    weeklyTargetSessions:
      fields.weeklyTargetSessions !== undefined
        ? fields.weeklyTargetSessions
        : current.weeklyTargetSessions,
    // schedule/timeZone columns were dropped in migration 0022 (A9) — a legacy
    // client payload's keys are stripped by the schema, never merged or written.
  }

  const revalidated = createActivitySchema.safeParse(merged)
  if (!revalidated.success) return { error: revalidated.error.flatten() }

  const now = new Date()
  const [updated] = await db
    .update(activities)
    .set({
      title: merged.title,
      color: merged.color ?? null,
      description: merged.description ?? null,
      defaultLocation: merged.defaultLocation ?? null,
      minDurationMin: merged.minDurationMin,
      maxDurationMin: merged.maxDurationMin,
      weeklyTargetSessions: merged.weeklyTargetSessions,
      updatedAt: now,
    })
    .where(and(eq(activities.id, id), eq(activities.userId, userId)))
    .returning()

  if (!updated) return { error: 'Not found' }

  revalidatePath('/calendar')
  revalidatePath('/activities')
  logger.info({ userId, activityId: id }, 'Activity updated')
  return { data: updated }
}

export async function deleteActivity(input: unknown): Promise<DeleteActivityResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = deleteActivitySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const { id } = parsed.data
  const userId = session.user.id
  const now = new Date()

  // Sequential deletes (no db.transaction — the neon-http driver used here
  // does not support transactions; mirrors deleteSeries's sequential-delete
  // shape, src/server/actions/series.ts).
  //
  // First: the activity's child recurrence rules. A series's rule dies with its
  // activity — the FK is SET NULL, so without this the orphaned rules would keep
  // generating events. Scoped by BOTH activityId and userId (the eventSeries
  // delete is a client-callable path via this 'use server' export).
  await db
    .delete(eventSeries)
    .where(and(eq(eventSeries.activityId, id), eq(eventSeries.userId, userId)))

  // Then: only future pending children. Past/completed events and the events
  // FK's SET NULL orphan the rest — an original event outlives its template.
  await db
    .delete(events)
    .where(
      and(
        eq(events.activityId, id),
        eq(events.userId, userId),
        eq(events.status, 'pending'),
        gt(events.startAt, now),
      ),
    )

  const deleted = await db
    .delete(activities)
    .where(and(eq(activities.id, id), eq(activities.userId, userId)))
    .returning({ id: activities.id })

  if (deleted.length === 0) return { error: 'Not found' }

  revalidatePath('/calendar')
  revalidatePath('/activities')
  logger.info({ userId, activityId: id }, 'Activity deleted')
  return { data: { success: true } }
}
