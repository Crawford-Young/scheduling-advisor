'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import {
  createTaskSchema,
  updateTaskSchema,
  deleteTaskSchema,
  updateTaskSeriesSchema,
} from '@/lib/schemas/task'
import { eq, and, gt } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'
import {
  DAY_TOKENS,
  SINGLE_OCCURRENCE,
  SINGLE_WEEK,
  SUPPORTED_RECURRENCES,
  buildIntervalRows,
  buildWeekdayRows,
  resolveSeriesBaseStart,
  weeksFromCount,
  type SeriesBaseFields,
} from '@/lib/series-generation'

type TaskActionResult = { data: (typeof tasks)['$inferSelect'] } | { error: unknown }

export async function createTask(input: unknown): Promise<TaskActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = createTaskSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const { recurrenceCount, recurrenceDays, startAt, endAt, ...rest } = parsed.data

  // Weekly multi-day fan-out (library drag-create across several days): one row
  // per selected weekday, anchored to that weekday within the start week, times
  // preserved. When recurrenceCount is also present it repeats over that many
  // weeks (weeks × weekdays); otherwise a single week. recurrence stays 'weekly'.
  const weekdayFanOut =
    rest.recurrence === 'weekly' &&
    recurrenceDays !== undefined &&
    recurrenceDays.length > 0 &&
    startAt !== null &&
    startAt !== undefined

  if (weekdayFanOut) {
    const weeks = weeksFromCount(recurrenceCount)
    const hasWeekCount = weeks > SINGLE_WEEK
    const groupId = crypto.randomUUID()
    const baseStart = new Date(startAt)
    const baseEnd = endAt ? new Date(endAt) : null
    const selectedDows = recurrenceDays
      .map((token) => DAY_TOKENS.indexOf(token))
      .sort((a, b) => a - b)

    const rows = buildWeekdayRows(
      {
        userId: session.user.id,
        title: rest.title,
        type: rest.type,
        // rest.recurrence is 'weekly' throughout this branch (weekdayFanOut guard).
        recurrence: rest.recurrence!,
        recurrenceGroupId: groupId,
        recurrenceDays,
        recurrenceCount: hasWeekCount ? weeks : null,
        targetDate: rest.targetDate ? new Date(rest.targetDate) : null,
        location: rest.location ?? null,
        description: rest.description ?? null,
        color: rest.color ?? null,
        allDay: rest.allDay ?? false,
      },
      baseStart,
      baseEnd,
      selectedDows,
      weeks,
    )

    const inserted = await db.insert(tasks).values(rows).returning()
    const first = inserted[0]
    if (!first) return { error: 'Insert failed' }
    logger.info({ userId: session.user.id, count: rows.length }, 'Tasks created (weekday fan-out)')
    return { data: first }
  }

  const shouldFanOut =
    recurrenceCount !== undefined &&
    recurrenceCount > 1 &&
    rest.recurrence !== null &&
    rest.recurrence !== undefined &&
    (SUPPORTED_RECURRENCES as readonly string[]).includes(rest.recurrence) &&
    startAt !== null &&
    startAt !== undefined

  if (shouldFanOut) {
    const groupId = crypto.randomUUID()
    const rows = buildIntervalRows(
      {
        userId: session.user.id,
        title: rest.title,
        type: rest.type,
        // shouldFanOut guarantees rest.recurrence is a non-null frequency string.
        recurrence: rest.recurrence!,
        recurrenceGroupId: groupId,
        recurrenceDays: null,
        recurrenceCount: recurrenceCount!,
        targetDate: rest.targetDate ? new Date(rest.targetDate) : null,
        location: rest.location ?? null,
        description: rest.description ?? null,
        color: rest.color ?? null,
        allDay: rest.allDay ?? false,
      },
      rest.recurrence!,
      new Date(startAt!),
      endAt ? new Date(endAt) : null,
      recurrenceCount!,
    )

    const inserted = await db.insert(tasks).values(rows).returning()
    const first = inserted[0]
    if (!first) return { error: 'Insert failed' }
    logger.info({ userId: session.user.id, count: rows.length }, 'Tasks created (fan-out)')
    return { data: first }
  }

  const isRecurring = rest.recurrence !== null && rest.recurrence !== undefined

  const [task] = await db
    .insert(tasks)
    .values({
      userId: session.user.id,
      title: rest.title,
      type: rest.type,
      recurrence: rest.recurrence ?? null,
      recurrenceGroupId: isRecurring ? crypto.randomUUID() : null,
      recurrenceDays: recurrenceDays ?? null,
      recurrenceCount: null,
      targetDate: rest.targetDate ? new Date(rest.targetDate) : null,
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
      location: rest.location ?? null,
      description: rest.description ?? null,
      color: rest.color ?? null,
      allDay: rest.allDay ?? false,
    })
    .returning()

  if (!task) return { error: 'Insert failed' }
  logger.info({ userId: session.user.id, taskId: task.id }, 'Task created')
  return { data: task }
}

export async function updateTask(input: unknown): Promise<TaskActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = updateTaskSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const { id, ...fields } = parsed.data

  const [task] = await db
    .update(tasks)
    .set({
      ...(fields.title !== undefined && { title: fields.title }),
      ...(fields.status !== undefined && { status: fields.status }),
      ...(fields.recurrence !== undefined && { recurrence: fields.recurrence }),
      ...(fields.targetDate !== undefined && {
        targetDate: fields.targetDate ? new Date(fields.targetDate) : null,
      }),
      ...(fields.startAt !== undefined && {
        startAt: fields.startAt ? new Date(fields.startAt) : null,
      }),
      ...(fields.endAt !== undefined && {
        endAt: fields.endAt ? new Date(fields.endAt) : null,
      }),
      ...(fields.location !== undefined && { location: fields.location }),
      ...(fields.description !== undefined && { description: fields.description }),
      ...(fields.color !== undefined && { color: fields.color }),
      ...(fields.allDay !== undefined && { allDay: fields.allDay }),
      ...(fields.locked !== undefined && { locked: fields.locked }),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, session.user.id)))
    .returning()

  if (!task) return { error: 'Not found' }

  return { data: task }
}

export async function deleteTask(
  input: unknown,
): Promise<{ data: { success: boolean } } | { error: unknown }> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = deleteTaskSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const deleted = await db
    .delete(tasks)
    .where(and(eq(tasks.id, parsed.data.id), eq(tasks.userId, session.user.id)))
    .returning({ id: tasks.id })

  if (deleted.length === 0) return { error: 'Not found' }

  return { data: { success: true } }
}

export async function updateTaskSeries(input: unknown): Promise<TaskActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = updateTaskSeriesSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const { taskId, recurrence, recurrenceDays, recurrenceCount } = parsed.data
  const userId = session.user.id
  const now = new Date()

  const [anchor] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1)

  if (!anchor) return { error: 'Not found' }
  // Without a start there are no occurrences to anchor a regenerated pattern to.
  if (!anchor.startAt) return { error: 'Not a series' }

  // S10: a row with a startAt but no group id is a standalone (one-off) event.
  // Setting a recurrence on it MATERIALIZES the series — the anchor becomes the
  // first member of a fresh group (identity/id/startAt/status untouched, gains
  // the pattern + a new group id), and future occurrences fan out around it.
  if (!anchor.recurrenceGroupId) {
    const newGroupId = crypto.randomUUID()
    const anchorStart = anchor.startAt
    const useWeekdays =
      recurrence === 'weekly' && recurrenceDays !== undefined && recurrenceDays.length > 0

    // Update the anchor in place: pattern + fresh group id only. The weekday path
    // persists the token array; the interval path persists null (matches
    // createTask and the existing regenerate path).
    const [updatedAnchor] = await db
      .update(tasks)
      .set({
        recurrence,
        recurrenceDays: useWeekdays ? recurrenceDays : null,
        recurrenceCount: recurrenceCount ?? null,
        recurrenceGroupId: newGroupId,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .returning()

    if (!updatedAnchor) return { error: 'Not found' }

    // Anchor future events to their OWN week; only re-anchor to the week of
    // `now` when the anchor is at/before now (see resolveSeriesBaseStart).
    // Preserves the anchor's time-of-day and duration either way (identical
    // anchoring to the existing series path below).
    const baseStart = resolveSeriesBaseStart(anchorStart, now)
    const durationMs = anchor.endAt ? anchor.endAt.getTime() - anchorStart.getTime() : null
    const baseEnd = durationMs === null ? null : new Date(baseStart.getTime() + durationMs)

    const baseFields: Omit<SeriesBaseFields, 'recurrenceDays'> = {
      userId,
      title: anchor.title,
      type: anchor.type,
      recurrence,
      recurrenceGroupId: newGroupId,
      recurrenceCount: recurrenceCount ?? null,
      targetDate: anchor.targetDate,
      location: anchor.location,
      description: anchor.description,
      color: anchor.color,
      allDay: anchor.allDay,
    }
    const weeks = weeksFromCount(recurrenceCount)
    const generated = useWeekdays
      ? buildWeekdayRows(
          { ...baseFields, recurrenceDays },
          baseStart,
          baseEnd,
          recurrenceDays.map((token) => DAY_TOKENS.indexOf(token)).sort((a, b) => a - b),
          weeks,
        )
      : buildIntervalRows(
          { ...baseFields, recurrenceDays: null },
          recurrence,
          baseStart,
          baseEnd,
          recurrenceCount ?? SINGLE_OCCURRENCE,
        )

    // Future-only, and skip the anchor's own (day, time) slot — the anchor IS
    // that occurrence, so a regenerated copy of it would be a duplicate.
    const anchorSlot = anchorStart.toISOString()
    const rows = generated
      .filter((row) => row.startAt.getTime() > now.getTime())
      .filter((row) => row.startAt.toISOString() !== anchorSlot)

    if (rows.length === 0) {
      logger.info({ userId, groupId: newGroupId }, 'Task series materialized with no extra rows')
      return { data: updatedAnchor }
    }

    const inserted = await db.insert(tasks).values(rows).returning()
    const first = inserted[0]
    if (!first) return { error: 'Insert failed' }
    logger.info({ userId, groupId: newGroupId, count: rows.length }, 'Task series materialized')
    return { data: updatedAnchor }
  }

  const groupId = anchor.recurrenceGroupId
  const anchorStart = anchor.startAt

  // Delete only the group's FUTURE pending rows; past rows and completed rows of
  // any date survive the regenerate.
  await db
    .delete(tasks)
    .where(
      and(
        eq(tasks.recurrenceGroupId, groupId),
        eq(tasks.userId, userId),
        eq(tasks.status, 'pending'),
        gt(tasks.startAt, now),
      ),
    )

  // Surviving completed occurrences — a regenerated slot on the exact (day, time)
  // of one of these is skipped so the recorded completion is not duplicated.
  const completedRows = await db
    .select({ startAt: tasks.startAt })
    .from(tasks)
    .where(
      and(
        eq(tasks.recurrenceGroupId, groupId),
        eq(tasks.userId, userId),
        eq(tasks.status, 'completed'),
      ),
    )
  const completedSlots = new Set(
    completedRows
      .filter((row): row is { startAt: Date } => row.startAt !== null)
      .map((row) => row.startAt.toISOString()),
  )

  // Anchor future events to their OWN week; only re-anchor to the week of
  // `now` (UTC) when the anchor is at/before now (see resolveSeriesBaseStart).
  // Preserves the series' original time-of-day and duration either way.
  const baseStart = resolveSeriesBaseStart(anchorStart, now)
  const durationMs = anchor.endAt ? anchor.endAt.getTime() - anchorStart.getTime() : null
  const baseEnd = durationMs === null ? null : new Date(baseStart.getTime() + durationMs)

  const baseFields: Omit<SeriesBaseFields, 'recurrenceDays'> = {
    userId,
    title: anchor.title,
    type: anchor.type,
    recurrence,
    recurrenceGroupId: groupId,
    recurrenceCount: recurrenceCount ?? null,
    targetDate: anchor.targetDate,
    location: anchor.location,
    description: anchor.description,
    color: anchor.color,
    allDay: anchor.allDay,
  }

  const useWeekdays =
    recurrence === 'weekly' && recurrenceDays !== undefined && recurrenceDays.length > 0
  const weeks = weeksFromCount(recurrenceCount)

  // Only the weekday path persists the token array — matches createTask, where
  // the interval fan-out always stamps recurrenceDays null.
  const generated = useWeekdays
    ? buildWeekdayRows(
        { ...baseFields, recurrenceDays },
        baseStart,
        baseEnd,
        recurrenceDays.map((token) => DAY_TOKENS.indexOf(token)).sort((a, b) => a - b),
        weeks,
      )
    : buildIntervalRows(
        { ...baseFields, recurrenceDays: null },
        recurrence,
        baseStart,
        baseEnd,
        recurrenceCount ?? SINGLE_OCCURRENCE,
      )

  // Series edits are future-only ("this and following" semantics, symmetric with
  // the future-pending delete predicate above): a regenerated slot landing at or
  // before `now` — e.g. a selected weekday earlier in the current week than
  // today — is dropped rather than inserted as a duplicate/backdated occurrence.
  const futureRows = generated.filter((row) => row.startAt.getTime() > now.getTime())
  const rows = futureRows.filter((row) => !completedSlots.has(row.startAt.toISOString()))

  if (rows.length === 0) {
    logger.info({ userId, groupId }, 'Task series regenerate produced no new rows')
    return { data: anchor }
  }

  const inserted = await db.insert(tasks).values(rows).returning()
  const first = inserted[0]
  if (!first) return { error: 'Insert failed' }
  logger.info({ userId, groupId, count: rows.length }, 'Task series regenerated')
  return { data: first }
}
