'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { createTaskSchema, updateTaskSchema, deleteTaskSchema } from '@/lib/schemas/task'
import { eq, and } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'

type TaskActionResult = { data: (typeof tasks)['$inferSelect'] } | { error: unknown }

const SUPPORTED_RECURRENCES = ['daily', 'weekly', 'monthly'] as const

// Index of each weekday token — must match Date#getUTCDay (0 = Sunday). Mirrors
// the library's DAY_ABBR ordering so recurrenceDays map to the right column.
const DAY_TOKENS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const DAYS_PER_WEEK = 7

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
    const weeks = recurrenceCount !== undefined && recurrenceCount > 1 ? recurrenceCount : 1
    const baseStart = new Date(startAt)
    const baseEnd = endAt ? new Date(endAt) : null
    const baseDow = baseStart.getUTCDay()
    const selectedDows = recurrenceDays
      .map((token) => DAY_TOKENS.indexOf(token))
      .sort((a, b) => a - b)

    const rows = []
    for (let week = 0; week < weeks; week++) {
      for (const dow of selectedDows) {
        const dayShift = dow - baseDow + week * DAYS_PER_WEEK
        const start = new Date(baseStart)
        start.setUTCDate(start.getUTCDate() + dayShift)
        let end: Date | null = null
        if (baseEnd) {
          end = new Date(baseEnd)
          end.setUTCDate(end.getUTCDate() + dayShift)
        }
        rows.push({
          userId: session.user.id,
          title: rest.title,
          type: rest.type,
          recurrence: rest.recurrence ?? null,
          targetDate: rest.targetDate ? new Date(rest.targetDate) : null,
          startAt: start,
          endAt: end,
          location: rest.location ?? null,
          description: rest.description ?? null,
          color: rest.color ?? null,
          allDay: rest.allDay ?? false,
        })
      }
    }

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
    const rows = Array.from({ length: recurrenceCount! }, (_, i) => {
      const start = new Date(startAt!)
      const end = endAt ? new Date(endAt) : null

      if (rest.recurrence === 'daily') {
        start.setUTCDate(start.getUTCDate() + i)
        if (end) end.setUTCDate(end.getUTCDate() + i)
      } else if (rest.recurrence === 'weekly') {
        start.setUTCDate(start.getUTCDate() + i * 7)
        if (end) end.setUTCDate(end.getUTCDate() + i * 7)
      } else if (rest.recurrence === 'monthly') {
        start.setUTCMonth(start.getUTCMonth() + i)
        if (end) end.setUTCMonth(end.getUTCMonth() + i)
      }

      return {
        userId: session.user.id,
        title: rest.title,
        type: rest.type,
        recurrence: rest.recurrence ?? null,
        targetDate: rest.targetDate ? new Date(rest.targetDate) : null,
        startAt: start,
        endAt: end,
        location: rest.location ?? null,
        description: rest.description ?? null,
        color: rest.color ?? null,
        allDay: rest.allDay ?? false,
      }
    })

    const inserted = await db.insert(tasks).values(rows).returning()
    const first = inserted[0]
    if (!first) return { error: 'Insert failed' }
    logger.info({ userId: session.user.id, count: rows.length }, 'Tasks created (fan-out)')
    return { data: first }
  }

  const [task] = await db
    .insert(tasks)
    .values({
      userId: session.user.id,
      title: rest.title,
      type: rest.type,
      recurrence: rest.recurrence ?? null,
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
