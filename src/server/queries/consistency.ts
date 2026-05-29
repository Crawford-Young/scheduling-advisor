import { db } from '@/db'
import { tasks, streaks } from '@/db/schema'
import { eq, and, gte, lte, inArray } from 'drizzle-orm'

interface WeeklyConsistency {
  readonly plannedCount: number
  readonly completedCount: number
  readonly consistencyPct: number
}

function getWeekBounds(): { weekStart: Date; weekEnd: Date } {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { weekStart: monday, weekEnd: sunday }
}

export async function getWeeklyConsistency(userId: string): Promise<WeeklyConsistency> {
  const { weekStart, weekEnd } = getWeekBounds()

  const weekTasks = await db
    .select({ status: tasks.status })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        gte(tasks.targetDate, weekStart),
        lte(tasks.targetDate, weekEnd),
      ),
    )
    .limit(200)

  const plannedCount = weekTasks.length
  const completedCount = weekTasks.filter((t) => t.status === 'completed').length
  const consistencyPct = plannedCount === 0 ? 0 : Math.round((completedCount / plannedCount) * 100)

  return { plannedCount, completedCount, consistencyPct }
}

export async function getTaskStreak(
  userId: string,
  taskId: string,
): Promise<{ currentStreak: number; bestStreak: number }> {
  const [row] = await db
    .select({ currentStreak: streaks.currentStreak, bestStreak: streaks.bestStreak })
    .from(streaks)
    .where(and(eq(streaks.userId, userId), eq(streaks.taskId, taskId)))
    .limit(1)
  return { currentStreak: row?.currentStreak ?? 0, bestStreak: row?.bestStreak ?? 0 }
}

export async function getTaskStreaks(
  userId: string,
  taskIds: readonly string[],
): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {}
  const rows = await db
    .select({ taskId: streaks.taskId, currentStreak: streaks.currentStreak })
    .from(streaks)
    .where(and(eq(streaks.userId, userId), inArray(streaks.taskId, taskIds as string[])))
  return Object.fromEntries(rows.map((r) => [r.taskId, r.currentStreak]))
}
