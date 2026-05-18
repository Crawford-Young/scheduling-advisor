'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { createTaskSchema, updateTaskSchema, deleteTaskSchema } from '@/lib/schemas/task'
import { eq, and } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { awardPointsInternal } from '@/server/actions/points'

export async function createTask(input: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = createTaskSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const { recurrenceCount, startAt, endAt, ...rest } = parsed.data

  const shouldFanOut =
    recurrenceCount !== undefined &&
    recurrenceCount > 1 &&
    rest.recurrence !== null &&
    rest.recurrence !== undefined &&
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
      }
    })

    const inserted = await db.insert(tasks).values(rows).returning()
    logger.info({ userId: session.user.id, count: rows.length }, 'Tasks created (fan-out)')
    return { data: inserted[0] }
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
    })
    .returning()

  logger.info({ userId: session.user.id, taskId: task!.id }, 'Task created')
  return { data: task }
}

export async function updateTask(input: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const parsed = updateTaskSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const { id, ...fields } = parsed.data

  let previousStatus: string | undefined
  if (fields.status === 'completed') {
    const [current] = await db
      .select({ status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, session.user.id)))
    previousStatus = current?.status
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
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, session.user.id)))
    .returning()

  if (!task) return { error: 'Not found' }

  if (task.status === 'completed' && previousStatus !== 'completed') {
    if (task.type === 'habit') {
      await awardPointsInternal(session.user.id, 'habit_complete', task.id)
    } else if (task.type === 'goal') {
      await awardPointsInternal(session.user.id, 'goal_complete', task.id)
    }
  }

  return { data: task }
}

export async function deleteTask(input: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const parsed = deleteTaskSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  await db.delete(tasks).where(and(eq(tasks.id, parsed.data.id), eq(tasks.userId, session.user.id)))

  return { data: { success: true } }
}
