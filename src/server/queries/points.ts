import { db } from '@/db'
import { userStats, pointEvents, users } from '@/db/schema'
import { eq, desc, sql, and, gte } from 'drizzle-orm'

/** Returns the user's current gamification stats, or undefined if they have none. */
export async function getUserStats(userId: string) {
  return db.query.userStats.findFirst({ where: eq(userStats.userId, userId) })
}

type Timeframe = 'week' | 'month' | 'alltime'

/** Returns the global leaderboard sorted by points for the timeframe. Excludes opted-out users. */
export async function getLeaderboard(timeframe: Timeframe) {
  const now = new Date()
  const cutoff =
    timeframe === 'week'
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : timeframe === 'month'
        ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        : undefined

  const pointsCol =
    timeframe === 'alltime'
      ? sql<number>`sum(${pointEvents.points})`
      : sql<number>`sum(case when ${pointEvents.createdAt} >= ${cutoff} then ${pointEvents.points} else 0 end)`

  return db
    .select({
      userId: users.id,
      name: users.name,
      image: users.image,
      points: pointsCol,
    })
    .from(users)
    .leftJoin(pointEvents, eq(pointEvents.userId, users.id))
    .where(eq(users.leaderboardOptOut, false))
    .orderBy(desc(pointsCol))
    .limit(50)
}

interface WeekScore {
  readonly week: string
  readonly points: number
}

/** Returns the user's weekly point totals for the past 12 weeks for ScoreHistory chart. */
export async function getPersonalHistory(userId: string): Promise<ReadonlyArray<WeekScore>> {
  const rows = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${pointEvents.createdAt}), 'Mon DD')`,
      points: sql<number>`sum(${pointEvents.points})`,
    })
    .from(pointEvents)
    .where(
      and(
        eq(pointEvents.userId, userId),
        gte(pointEvents.createdAt, new Date(Date.now() - 84 * 24 * 60 * 60 * 1000)),
      ),
    )
    .orderBy(sql`date_trunc('week', ${pointEvents.createdAt})`)
    .limit(12)

  return rows as WeekScore[]
}
