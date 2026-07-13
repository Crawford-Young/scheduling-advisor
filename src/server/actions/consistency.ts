'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { recordCompletionSchema, updateTaskDateSchema } from '@/lib/schemas/consistency'
import { eq, and } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { revalidatePath } from 'next/cache'
import { computeGroupStreak, computePerOccurrenceStreaks } from '@/lib/streaks'

interface CompletionResult {
  readonly currentStreak: number
  readonly bestStreak: number
  readonly isPerfectWeek: boolean
}

type ActionResult<T> = { data: T } | { error: string }

// rescheduleTask only ever writes shared time-of-day fields (startAt/endAt/
// targetDate), so any call against a grouped row is a defect — that write
// must go through `updateSeries` (src/server/actions/series-mutations.ts) so
// every row in the group stays in sync.
const GROUPED_ROW_ERROR = 'Grouped rows are series-managed — use updateSeries'

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

  let currentStreak = 0
  let bestStreak = 0
  if (row?.groupId) {
    const occurrences = await db
      .select({
        id: tasks.id,
        startAt: tasks.startAt,
        status: tasks.status,
        timeZone: tasks.timeZone,
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.recurrenceGroupId, row.groupId)))
    currentStreak = computePerOccurrenceStreaks(occurrences, now)[taskId] ?? 0
    bestStreak = computeGroupStreak(occurrences, now).best
  }

  revalidatePath('/calendar')

  const { getWeeklyConsistency } = await import('@/server/queries/consistency')
  const consistency = await getWeeklyConsistency(userId)
  const isPerfectWeek =
    consistency.plannedCount > 0 && consistency.completedCount === consistency.plannedCount

  return { data: { currentStreak, bestStreak, isPerfectWeek } }
}

export async function rescheduleTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success: rateLimitOk } = await ratelimit.limit(session.user.id)
  if (!rateLimitOk) return { error: 'Too many requests' }

  const parsed = updateTaskDateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const { taskId, newStartAt, newEndAt, newTargetDate } = parsed.data
  const userId = session.user.id

  const [row] = await db
    .select({ recurrenceGroupId: tasks.recurrenceGroupId })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1)

  if (row?.recurrenceGroupId != null) return { error: GROUPED_ROW_ERROR }

  const [task] = await db
    .update(tasks)
    .set({
      ...(newStartAt !== undefined && { startAt: new Date(newStartAt) }),
      ...(newEndAt !== undefined && { endAt: new Date(newEndAt) }),
      ...(newTargetDate !== undefined && { targetDate: new Date(newTargetDate) }),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning({ id: tasks.id })

  if (!task) return { error: 'Not found' }
  revalidatePath('/calendar')
  return { data: { id: task.id } }
}
