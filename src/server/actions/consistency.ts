'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { recordCompletionSchema, updateTaskDateSchema } from '@/lib/schemas/consistency'
import { eq, and } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { revalidatePath } from 'next/cache'
import { computeGroupStreak } from '@/lib/streaks'

interface CompletionResult {
  readonly currentStreak: number
  readonly bestStreak: number
  readonly isPerfectWeek: boolean
}

type ActionResult<T> = { data: T } | { error: string }

export async function recordCompletion(input: unknown): Promise<ActionResult<CompletionResult>> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success: rateLimitOk } = await ratelimit.limit(session.user.id)
  if (!rateLimitOk) return { error: 'Too many requests' }

  const parsed = recordCompletionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const { taskId } = parsed.data
  const userId = session.user.id
  const now = new Date()

  await db
    .update(tasks)
    .set({ status: 'completed', updatedAt: now })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))

  const [row] = await db
    .select({ groupId: tasks.recurrenceGroupId })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1)

  let streak = { current: 0, best: 0 }
  if (row?.groupId) {
    const occurrences = await db
      .select({ startAt: tasks.startAt, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.recurrenceGroupId, row.groupId)))
    streak = computeGroupStreak(occurrences, now)
  }

  revalidatePath('/calendar')

  const { getWeeklyConsistency } = await import('@/server/queries/consistency')
  const consistency = await getWeeklyConsistency(userId)
  const isPerfectWeek =
    consistency.plannedCount > 0 && consistency.completedCount === consistency.plannedCount

  return { data: { currentStreak: streak.current, bestStreak: streak.best, isPerfectWeek } }
}

export async function rescheduleTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success: rateLimitOk } = await ratelimit.limit(session.user.id)
  if (!rateLimitOk) return { error: 'Too many requests' }

  const parsed = updateTaskDateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const { taskId, newStartAt, newEndAt, newTargetDate } = parsed.data

  const [task] = await db
    .update(tasks)
    .set({
      ...(newStartAt !== undefined && { startAt: new Date(newStartAt) }),
      ...(newEndAt !== undefined && { endAt: new Date(newEndAt) }),
      ...(newTargetDate !== undefined && { targetDate: new Date(newTargetDate) }),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id)))
    .returning({ id: tasks.id })

  if (!task) return { error: 'Not found' }
  revalidatePath('/calendar')
  return { data: { id: task.id } }
}
