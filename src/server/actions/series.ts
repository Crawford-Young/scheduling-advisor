'use server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db'
import { activities, events, eventSeries, calendarPrefs } from '@/db/schema'
import { and, eq, gt } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { createSeriesSchema, updateSeriesSchema, deleteSeriesSchema } from '@/lib/schemas/series'
import type { Visibility } from '@/lib/schemas/visibility'
import { generateEventsForSeries } from '@/server/generation'

type SeriesRow = (typeof eventSeries)['$inferSelect']
type SeriesInsert = (typeof eventSeries)['$inferInsert']
type SeriesActionResult = { data: SeriesRow } | { error: unknown }
type DeleteSeriesResult = { data: { success: boolean } } | { error: unknown }

// `anchorStartAt - 1 minute` seeds `generatedThrough` so the sliding-window
// sweep's strict `startAt > generatedThrough` check makes the anchor
// occurrence itself eligible — generation begins AT the anchor, not today.
const ANCHOR_GENERATED_THROUGH_OFFSET_MS = 60_000

// No calendarPrefs row (or a row whose defaultVisibility somehow reads
// undefined) falls back to the most restrictive option.
const FALLBACK_VISIBILITY: Visibility = 'private'

// Mirrors `activityBelongsToUser` in events.ts (module-private there too, so
// duplicated rather than imported) — verifies a client-supplied activityId
// belongs to the calling user before a series can be attached to it.
async function activityBelongsToUser(activityId: string, userId: string): Promise<boolean> {
  const [owned] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
    .limit(1)
  return owned !== undefined
}

// Mirrors `resolveDefaultVisibility` in events.ts (module-private there too,
// so duplicated rather than imported) — default-visibility cascade (V3): a
// create payload that omits `visibility` falls back to the caller's
// `calendarPrefs.defaultVisibility`, or `FALLBACK_VISIBILITY` when the caller
// has no prefs row at all.
async function resolveDefaultVisibility(userId: string): Promise<Visibility> {
  const [prefs] = await db
    .select({ defaultVisibility: calendarPrefs.defaultVisibility })
    .from(calendarPrefs)
    .where(eq(calendarPrefs.userId, userId))
    .limit(1)
  return prefs?.defaultVisibility ?? FALLBACK_VISIBILITY
}

function numOrNull(value: number | null | undefined): number | null {
  return value ?? null
}

function weekdaysEqual(
  a: readonly number[] | null | undefined,
  b: readonly number[] | null | undefined,
): boolean {
  const ax = a ?? null
  const bx = b ?? null
  if (ax === null && bx === null) return true
  // Unreachable in practice: ruleChanged short-circuits on freq before calling this when freq
  // changes, and same-freq comparisons can't differ in null-ness (per-freq schema invariant ties
  // non-null weekdays to freq === 'weekly'). Defensive fallback — DoD branch exemption.
  if (ax === null || bx === null) return false
  if (ax.length !== bx.length) return false
  return ax.every((value, index) => value === bx[index])
}

function untilEqual(a: Date | null | undefined, b: Date | null | undefined): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null)
}

export async function createSeries(input: unknown): Promise<SeriesActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = createSeriesSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const data = parsed.data
  const userId = session.user.id

  if (data.activityId && !(await activityBelongsToUser(data.activityId, userId))) {
    return { error: 'Activity not found' }
  }

  // Start-anchor seeding: `anchorStartAt` is input-only (never a column, see
  // src/lib/schemas/series.ts) — it is not referenced below, so it is
  // implicitly stripped before insert.
  const generatedThrough = data.anchorStartAt
    ? new Date(data.anchorStartAt.getTime() - ANCHOR_GENERATED_THROUGH_OFFSET_MS)
    : null

  const visibility = data.visibility ?? (await resolveDefaultVisibility(userId))

  const [series] = await db
    .insert(eventSeries)
    .values({
      userId,
      activityId: data.activityId ?? null,
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      color: data.color ?? null,
      visibility,
      freq: data.freq,
      weekdays: data.weekdays ?? null,
      dayOfMonth: data.dayOfMonth ?? null,
      nthOrdinal: data.nthOrdinal ?? null,
      nthWeekday: data.nthWeekday ?? null,
      month: data.month ?? null,
      startMinutes: data.startMinutes,
      durationMin: data.durationMin,
      timeZone: data.timeZone ?? null,
      until: data.until ?? null,
      generatedThrough,
    })
    .returning()

  if (!series) return { error: 'Insert failed' }

  await generateEventsForSeries(series, new Date())

  revalidatePath('/calendar')
  revalidatePath('/activities')
  logger.info({ userId, seriesId: series.id }, 'Series created')
  return { data: series }
}

export async function updateSeries(input: unknown): Promise<SeriesActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = updateSeriesSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const { id, ...fields } = parsed.data
  const userId = session.user.id

  const [current] = await db
    .select()
    .from(eventSeries)
    .where(and(eq(eventSeries.id, id), eq(eventSeries.userId, userId)))
    .limit(1)

  if (!current) return { error: 'Not found' }

  if (fields.activityId && !(await activityBelongsToUser(fields.activityId, userId))) {
    return { error: 'Activity not found' }
  }

  // Fetch-merge-revalidate (mirrors updateEvent's merge pattern, events.ts —
  // and updateActivity's full re-validation): a partial payload can enforce
  // field-level rules but not the per-freq cross-field invariants it can't
  // see. Merge the input over the stored row and re-validate the WHOLE
  // object against the full create schema BEFORE writing.
  //
  // Rule-mode fields (weekdays/dayOfMonth/nthOrdinal/nthWeekday/month) only
  // fall back to the CURRENT row's value when `freq` is staying the same —
  // when freq is CHANGING, an unsupplied rule-mode field is treated as
  // absent (null on write), never carried over from the old freq's rule.
  // Without this, e.g. a weekly→monthly edit that only supplies `dayOfMonth`
  // would leak the old `weekdays` into the merged object and fail the
  // per-freq superRefine (monthly forbids weekdays).
  const freqChanging = fields.freq !== undefined && fields.freq !== current.freq
  const merged = {
    activityId: fields.activityId !== undefined ? fields.activityId : current.activityId,
    title: fields.title !== undefined ? fields.title : current.title,
    description: fields.description !== undefined ? fields.description : current.description,
    location: fields.location !== undefined ? fields.location : current.location,
    color: fields.color !== undefined ? fields.color : current.color,
    visibility: fields.visibility !== undefined ? fields.visibility : current.visibility,
    freq: fields.freq !== undefined ? fields.freq : current.freq,
    weekdays:
      fields.weekdays !== undefined
        ? fields.weekdays
        : freqChanging
          ? undefined
          : (current.weekdays ?? undefined),
    dayOfMonth:
      fields.dayOfMonth !== undefined
        ? fields.dayOfMonth
        : freqChanging
          ? undefined
          : (current.dayOfMonth ?? undefined),
    nthOrdinal:
      fields.nthOrdinal !== undefined
        ? fields.nthOrdinal
        : freqChanging
          ? undefined
          : (current.nthOrdinal ?? undefined),
    nthWeekday:
      fields.nthWeekday !== undefined
        ? fields.nthWeekday
        : freqChanging
          ? undefined
          : (current.nthWeekday ?? undefined),
    month:
      fields.month !== undefined
        ? fields.month
        : freqChanging
          ? undefined
          : (current.month ?? undefined),
    startMinutes: fields.startMinutes !== undefined ? fields.startMinutes : current.startMinutes,
    durationMin: fields.durationMin !== undefined ? fields.durationMin : current.durationMin,
    timeZone: fields.timeZone !== undefined ? fields.timeZone : (current.timeZone ?? undefined),
    until: fields.until !== undefined ? fields.until : (current.until ?? undefined),
  }

  const revalidated = createSeriesSchema.safeParse(merged)
  if (!revalidated.success) return { error: revalidated.error.flatten() }

  // A rule-shape edit (any field that changes what/when the sweep generates)
  // invalidates future not-yet-occurred pending occurrences; a fill-field-only
  // edit (title/description/location/color/activityId) never retro-edits
  // existing rows — fill fields apply at generation time only.
  const ruleChanged =
    merged.freq !== current.freq ||
    !weekdaysEqual(merged.weekdays, current.weekdays) ||
    numOrNull(merged.dayOfMonth) !== numOrNull(current.dayOfMonth) ||
    numOrNull(merged.nthOrdinal) !== numOrNull(current.nthOrdinal) ||
    numOrNull(merged.nthWeekday) !== numOrNull(current.nthWeekday) ||
    numOrNull(merged.month) !== numOrNull(current.month) ||
    merged.startMinutes !== current.startMinutes ||
    merged.durationMin !== current.durationMin ||
    (merged.timeZone ?? null) !== (current.timeZone ?? null) ||
    !untilEqual(merged.until, current.until)

  const now = new Date()
  const updateValues: Partial<SeriesInsert> = {
    activityId: merged.activityId ?? null,
    title: merged.title,
    description: merged.description ?? null,
    location: merged.location ?? null,
    color: merged.color ?? null,
    visibility: merged.visibility,
    freq: merged.freq,
    weekdays: merged.weekdays ?? null,
    dayOfMonth: merged.dayOfMonth ?? null,
    nthOrdinal: merged.nthOrdinal ?? null,
    nthWeekday: merged.nthWeekday ?? null,
    month: merged.month ?? null,
    startMinutes: merged.startMinutes,
    durationMin: merged.durationMin,
    timeZone: merged.timeZone ?? null,
    until: merged.until ?? null,
    updatedAt: now,
  }
  if (ruleChanged) updateValues.generatedThrough = now

  const [updated] = await db
    .update(eventSeries)
    .set(updateValues)
    .where(and(eq(eventSeries.id, id), eq(eventSeries.userId, userId)))
    .returning()

  if (!updated) return { error: 'Not found' }

  if (ruleChanged) {
    // Only this series' FUTURE PENDING occurrences are invalidated — past and
    // completed rows, and any other series' rows, are untouched.
    await db
      .delete(events)
      .where(
        and(
          eq(events.seriesId, id),
          eq(events.userId, userId),
          eq(events.status, 'pending'),
          gt(events.startAt, now),
        ),
      )
    await generateEventsForSeries(updated, now)
  }

  revalidatePath('/calendar')
  revalidatePath('/activities')
  logger.info({ userId, seriesId: id, ruleChanged }, 'Series updated')
  return { data: updated }
}

export async function deleteSeries(input: unknown): Promise<DeleteSeriesResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = deleteSeriesSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const { id, mode } = parsed.data
  const userId = session.user.id
  const now = new Date()

  // Sequential deletes (no db.transaction — the neon-http driver used here
  // does not support transactions; mirrors deleteActivity's sequential-delete
  // shape, src/server/actions/activities.ts). `deleteFuture` removes only
  // future pending occurrences before the series row goes; `keep` leaves
  // every occurrence in place — the FK's SET NULL (events.seriesId) unlinks
  // them from the deleted series. Past/completed rows are untouched either
  // way.
  if (mode === 'deleteFuture') {
    await db
      .delete(events)
      .where(
        and(
          eq(events.seriesId, id),
          eq(events.userId, userId),
          eq(events.status, 'pending'),
          gt(events.startAt, now),
        ),
      )
  }

  const deleted = await db
    .delete(eventSeries)
    .where(and(eq(eventSeries.id, id), eq(eventSeries.userId, userId)))
    .returning({ id: eventSeries.id })

  if (deleted.length === 0) return { error: 'Not found' }

  revalidatePath('/calendar')
  revalidatePath('/activities')
  logger.info({ userId, seriesId: id, mode }, 'Series deleted')
  return { data: { success: true } }
}
