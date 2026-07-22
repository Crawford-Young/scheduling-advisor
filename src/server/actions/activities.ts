'use server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db'
import { activities, events } from '@/db/schema'
import { and, eq, gt } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'
import {
  createActivitySchema,
  updateActivitySchema,
  type ActivityScheduleSlot,
} from '@/lib/schemas/activity'
import { z } from 'zod'
import { generateEventsForActivity } from '@/server/generation'
import { geocodeForSave } from '@/server/travel'

type ActivityRow = (typeof activities)['$inferSelect']
type ActivityActionResult = { data: ActivityRow } | { error: unknown }
type DeleteActivityResult = { data: { success: boolean } } | { error: unknown }

// Not exported — 'use server' files may only export async functions; this
// stays module-private.
const deleteActivitySchema = z.object({ id: z.string().uuid() })

// Positional slot-array equality — schedule is a sequence, not a set (unlike
// tasks' order-insensitive weekday-token comparison).
function schedulesEqual(
  a: readonly ActivityScheduleSlot[],
  b: readonly ActivityScheduleSlot[],
): boolean {
  if (a.length !== b.length) return false
  return a.every((slot, i) => {
    // Non-null: the length check above guarantees every index < a.length is
    // also < b.length.
    const other = b[i]!
    return (
      slot.day === other.day &&
      slot.startMinutes === other.startMinutes &&
      slot.durationMin === other.durationMin
    )
  })
}

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
      ...(await geocodeForSave(userId, data.defaultLocation ?? null)),
      minDurationMin: data.minDurationMin,
      maxDurationMin: data.maxDurationMin,
      weeklyTargetSessions: data.weeklyTargetSessions,
      schedule: data.schedule,
      timeZone: data.timeZone ?? null,
    })
    .returning()

  if (!activity) return { error: 'Insert failed' }

  await generateEventsForActivity(activity, new Date())

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
  // full create schema before any pattern-diff/regeneration decision.
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
    schedule: fields.schedule !== undefined ? fields.schedule : current.schedule,
    timeZone: fields.timeZone !== undefined ? fields.timeZone : (current.timeZone ?? undefined),
  }

  const revalidated = createActivitySchema.safeParse(merged)
  if (!revalidated.success) return { error: revalidated.error.flatten() }

  const mergedTimeZone = merged.timeZone ?? null
  const patternChanged =
    !schedulesEqual(merged.schedule, current.schedule) ||
    mergedTimeZone !== (current.timeZone ?? null)

  // Re-geocode ONLY when the defaultLocation text actually changed — an
  // unchanged/omitted location preserves the stored coords (omitted from the
  // set), and a cleared location resolves to null coords via geocodeForSave's
  // empty-text guard.
  const defaultLocationChanged = merged.defaultLocation !== current.defaultLocation

  const now = new Date()
  const [updated] = await db
    .update(activities)
    .set({
      title: merged.title,
      color: merged.color ?? null,
      description: merged.description ?? null,
      defaultLocation: merged.defaultLocation ?? null,
      ...(defaultLocationChanged ? await geocodeForSave(userId, merged.defaultLocation) : {}),
      minDurationMin: merged.minDurationMin,
      maxDurationMin: merged.maxDurationMin,
      weeklyTargetSessions: merged.weeklyTargetSessions,
      schedule: merged.schedule,
      timeZone: mergedTimeZone,
      ...(patternChanged && { generatedThrough: now }),
      updatedAt: now,
    })
    .where(and(eq(activities.id, id), eq(activities.userId, userId)))
    .returning()

  if (!updated) return { error: 'Not found' }

  if (patternChanged) {
    await generateEventsForActivity(updated, now)
  }

  revalidatePath('/calendar')
  revalidatePath('/activities')
  logger.info({ userId, activityId: id, patternChanged }, 'Activity updated')
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
  // shape, src/server/actions/series-mutations.ts). Only future pending
  // children are removed; past/completed events and the FK's SET NULL orphan
  // the rest — an original event outlives its template.
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
