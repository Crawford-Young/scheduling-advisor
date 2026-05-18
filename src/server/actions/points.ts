'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { pointEvents, userStats } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { revalidatePath } from 'next/cache'

type EventType =
  | 'habit_complete'
  | 'goal_milestone'
  | 'goal_complete'
  | 'perfect_day'
  | 'perfect_week'

const POINT_VALUES: Record<EventType, number> = {
  habit_complete: 10,
  goal_milestone: 50,
  goal_complete: 200,
  perfect_day: 25,
  perfect_week: 100,
}

const LEVEL_THRESHOLDS: ReadonlyArray<[number, string]> = [
  [10_000, 'evergreen'],
  [5_000, 'flourishing'],
  [2_000, 'thriving'],
  [500, 'growing'],
  [0, 'seedling'],
]

function computeLevel(totalPoints: number): string {
  for (const [threshold, level] of LEVEL_THRESHOLDS) {
    if (totalPoints >= threshold) return level
  }
  /* istanbul ignore next -- exhaustive: [0,'seedling'] always matches */
  return 'seedling'
}

interface AwardPointsResult {
  readonly error?: string
  readonly pointsAwarded?: number
}

/** Awards points for a completed action and updates the user's running stats. */
export async function awardPoints(
  eventType: EventType,
  referenceId?: string,
): Promise<AwardPointsResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const earned = await awardPointsInternal(session.user.id, eventType, referenceId)
  return { pointsAwarded: earned }
}

/** Internal version — caller must already be authenticated. Not exported as a server action. */
export async function awardPointsInternal(
  userId: string,
  eventType: EventType,
  referenceId?: string,
): Promise<number> {
  const existing = await db.query.userStats.findFirst({ where: eq(userStats.userId, userId) })

  const multiplier = existing ? parseFloat(existing.multiplier as string) : 1.0
  const base = POINT_VALUES[eventType]
  const earned = eventType === 'habit_complete' ? Math.round(base * multiplier) : base

  await db.insert(pointEvents).values({ userId, eventType, points: earned, referenceId })

  const newTotal = (existing?.totalPoints ?? 0) + earned
  const newWeekly = (existing?.weeklyPoints ?? 0) + earned
  const newLevel = computeLevel(newTotal) as
    | 'seedling'
    | 'growing'
    | 'thriving'
    | 'flourishing'
    | 'evergreen'

  await db
    .update(userStats)
    .set({
      totalPoints: newTotal,
      weeklyPoints: newWeekly,
      currentLevel: newLevel,
      updatedAt: new Date(),
    })
    .where(eq(userStats.userId, userId))

  revalidatePath('/')
  return earned
}
