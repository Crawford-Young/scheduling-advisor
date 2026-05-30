'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { tasks, streaks } from '@/db/schema'
import { recordCompletionSchema, updateTaskDateSchema } from '@/lib/schemas/consistency'
import { eq, and } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { revalidatePath } from 'next/cache'

interface CompletionResult {
  readonly currentStreak: number
  readonly bestStreak: number
  readonly isPerfectWeek: boolean
}

type ActionResult<T> = { data: T } | { error: string }

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isYesterday(date: Date, relativeTo: Date): boolean {
  const yesterday = new Date(relativeTo)
  yesterday.setDate(relativeTo.getDate() - 1)
  return isSameDay(date, yesterday)
}

export async function recordCompletion(input: unknown): Promise<ActionResult<CompletionResult>> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success: rateLimitOk } = await ratelimit.limit(session.user.id)
  if (!rateLimitOk) return { error: 'Too many requests' }

  const parsed = recordCompletionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const { taskId, outcome } = parsed.data
  const userId = session.user.id
  const now = new Date()

  if (outcome === 'done') {
    await db
      .update(tasks)
      .set({ status: 'completed', updatedAt: now })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
  }

  const [existing] = await db
    .select()
    .from(streaks)
    .where(and(eq(streaks.taskId, taskId), eq(streaks.userId, userId)))
    .limit(1)

  let newCurrentStreak: number
  let newBestStreak: number

  if (outcome === 'skip') {
    newCurrentStreak = 0
    newBestStreak = existing?.bestStreak ?? 0
  } else {
    if (!existing || !existing.lastCompletedAt) {
      newCurrentStreak = 1
    } else if (isSameDay(existing.lastCompletedAt, now)) {
      newCurrentStreak = existing.currentStreak
    } else if (isYesterday(existing.lastCompletedAt, now)) {
      newCurrentStreak = existing.currentStreak + 1
    } else {
      newCurrentStreak = 1
    }
    newBestStreak = Math.max(newCurrentStreak, existing?.bestStreak ?? 0)
  }

  const [updated] = await db
    .insert(streaks)
    .values({
      userId,
      taskId,
      currentStreak: newCurrentStreak,
      bestStreak: newBestStreak,
      lastCompletedAt: outcome === 'done' ? now : (existing?.lastCompletedAt ?? null),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [streaks.userId, streaks.taskId],
      set: {
        currentStreak: newCurrentStreak,
        bestStreak: newBestStreak,
        lastCompletedAt: outcome === 'done' ? now : (existing?.lastCompletedAt ?? null),
        updatedAt: now,
      },
    })
    .returning()

  revalidatePath('/calendar')

  const { getWeeklyConsistency } = await import('@/server/queries/consistency')
  const consistency = await getWeeklyConsistency(userId)
  const isPerfectWeek =
    consistency.plannedCount > 0 && consistency.completedCount === consistency.plannedCount

  return {
    data: {
      currentStreak: updated?.currentStreak ?? newCurrentStreak,
      bestStreak: updated?.bestStreak ?? newBestStreak,
      isPerfectWeek,
    },
  }
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
