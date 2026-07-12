'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { tasks, seriesSlotTombstones } from '@/db/schema'
import {
  createTaskSchema,
  updateTaskSchema,
  deleteTaskSchema,
  type UpdateTask,
} from '@/lib/schemas/task'
import { eq, and } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'
import {
  DAY_TOKENS,
  SINGLE_WEEK,
  SUPPORTED_RECURRENCES,
  buildIntervalRows,
  buildWeekdayRows,
  weeksFromCount,
} from '@/lib/series-generation'

type TaskActionResult = { data: (typeof tasks)['$inferSelect'] } | { error: unknown }

// Error returned when a grouped row's shared fields are written via `updateTask`
// or `rescheduleTask` — those writes must go through `updateSeries`
// (src/server/actions/series-mutations.ts) so every row in the group stays in
// sync. `status`/`locked` are per-occurrence and excluded from this list.
const GROUPED_ROW_ERROR = 'Grouped rows are series-managed — use updateSeries'

// Every updateTask field EXCEPT `id`, `status` and `locked` is a shared field
// propagated by updateSeries — writing any of these to a grouped row via
// updateTask would silently desync the rest of the group.
const GROUPED_SHARED_FIELDS: readonly Exclude<keyof UpdateTask, 'id' | 'status' | 'locked'>[] = [
  'title',
  'recurrence',
  'targetDate',
  'startAt',
  'endAt',
  'color',
  'location',
  'description',
  'allDay',
]

export async function createTask(input: unknown): Promise<TaskActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = createTaskSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const { recurrenceCount, recurrenceDays, startAt, endAt, timeZone, ...rest } = parsed.data

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
        timeZone: timeZone ?? null,
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
        timeZone: timeZone ?? null,
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
      timeZone: timeZone ?? null,
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

  const [row] = await db
    .select({ recurrenceGroupId: tasks.recurrenceGroupId })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, session.user.id)))
    .limit(1)

  if (row?.recurrenceGroupId != null) {
    const touchesSharedField = GROUPED_SHARED_FIELDS.some((field) => fields[field] !== undefined)
    if (touchesSharedField) return { error: GROUPED_ROW_ERROR }
  }

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

  // Read the slot identity BEFORE deleting: a grouped occurrence must leave a
  // tombstone so the rolling auto-extend sweep never resurrects it.
  const [row] = await db
    .select({ recurrenceGroupId: tasks.recurrenceGroupId, startAt: tasks.startAt })
    .from(tasks)
    .where(and(eq(tasks.id, parsed.data.id), eq(tasks.userId, session.user.id)))
    .limit(1)

  const deleted = await db
    .delete(tasks)
    .where(and(eq(tasks.id, parsed.data.id), eq(tasks.userId, session.user.id)))
    .returning({ id: tasks.id })

  if (deleted.length === 0) return { error: 'Not found' }

  // Ungrouped rows (or a grouped row with no dated slot) leave no tombstone.
  // The unique (group, slot) index makes the insert idempotent.
  if (row?.recurrenceGroupId != null && row.startAt != null) {
    await db
      .insert(seriesSlotTombstones)
      .values({
        userId: session.user.id,
        recurrenceGroupId: row.recurrenceGroupId,
        slotStart: row.startAt,
      })
      .onConflictDoNothing()
  }

  return { data: { success: true } }
}
