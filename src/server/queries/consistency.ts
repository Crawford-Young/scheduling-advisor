import { db } from '@/db'
import { tasks } from '@/db/schema'
import { eq, and, gte, lte, inArray } from 'drizzle-orm'
import { computeGroupStreak } from '@/lib/streaks'

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

export async function getTaskStreaks(
  userId: string,
  taskIds: readonly string[],
): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {}
  const requested = await db
    .select({ id: tasks.id, groupId: tasks.recurrenceGroupId })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds as string[])))
  const groupIds = [
    ...new Set(requested.map((r) => r.groupId).filter((g): g is string => g !== null)),
  ]
  if (groupIds.length === 0) return {}
  const occurrences = await db
    .select({ groupId: tasks.recurrenceGroupId, startAt: tasks.startAt, status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), inArray(tasks.recurrenceGroupId, groupIds)))
  const byGroup = new Map<string, { startAt: Date | null; status: string }[]>()
  for (const o of occurrences) {
    if (o.groupId === null) continue
    const list = byGroup.get(o.groupId) ?? []
    list.push({ startAt: o.startAt, status: o.status })
    byGroup.set(o.groupId, list)
  }
  const now = new Date()
  const currentByGroup = new Map<string, number>()
  for (const [gid, occ] of byGroup) currentByGroup.set(gid, computeGroupStreak(occ, now).current)
  return Object.fromEntries(
    requested
      .filter((r): r is { id: string; groupId: string } => r.groupId !== null)
      .map((r) => [r.id, currentByGroup.get(r.groupId) ?? 0]),
  )
}
