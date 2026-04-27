'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { createTaskSchema, updateTaskSchema, deleteTaskSchema } from '@/lib/schemas/task'
import { eq, and } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'

export async function createTask(input: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = createTaskSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const [task] = await db
    .insert(tasks)
    .values({
      userId: session.user.id,
      title: parsed.data.title,
      type: parsed.data.type,
      recurrence: parsed.data.recurrence ?? null,
      targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null,
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
  const [task] = await db
    .update(tasks)
    .set({
      ...(fields.title !== undefined && { title: fields.title }),
      ...(fields.status !== undefined && { status: fields.status }),
      ...(fields.recurrence !== undefined && { recurrence: fields.recurrence }),
      ...(fields.targetDate !== undefined && {
        targetDate: fields.targetDate ? new Date(fields.targetDate) : null,
      }),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, session.user.id)))
    .returning()

  if (!task) return { error: 'Not found' }
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
