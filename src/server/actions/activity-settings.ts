'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { updateActivitySettingsSchema } from '@/lib/schemas/activity-settings'
import { eq, and } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { revalidatePath } from 'next/cache'

type ActionResult<T> = { data: T } | { error: string }

export async function updateActivitySettings(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success: rateLimitOk } = await ratelimit.limit(session.user.id)
  if (!rateLimitOk) return { error: 'Too many requests' }

  const parsed = updateActivitySettingsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const { taskId, activityType, visibility, joinability, maxParticipants } = parsed.data

  const [task] = await db
    .update(tasks)
    .set({
      activityType,
      visibility,
      joinability: activityType === 'group' ? (joinability ?? null) : null,
      maxParticipants: activityType === 'group' ? (maxParticipants ?? null) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id)))
    .returning({ id: tasks.id })

  if (!task) return { error: 'Not found' }
  revalidatePath('/calendar')
  return { data: { id: task.id } }
}
