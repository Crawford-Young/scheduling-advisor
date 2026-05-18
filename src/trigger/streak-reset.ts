import { schedules } from '@trigger.dev/sdk/v3'
import { db } from '@/db'
import { userStats, tasks, checkIns } from '@/db/schema'
import { eq, and, gte, isNotNull } from 'drizzle-orm'
import { logger } from '@/lib/logger'

export const streakResetTask = schedules.task({
  id: 'streak-reset',
  cron: '5 0 * * *',
  run: async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)

    const usersWithHabits = await db
      .selectDistinct({ userId: tasks.userId })
      .from(tasks)
      .where(eq(tasks.type, 'habit'))

    for (const { userId } of usersWithHabits) {
      const completedYesterday = await db
        .select()
        .from(checkIns)
        .where(
          and(
            eq(checkIns.userId, userId),
            isNotNull(checkIns.completedAt),
            gte(checkIns.completedAt, yesterday),
          ),
        )
        .limit(1)

      if (completedYesterday.length === 0) {
        await db
          .update(userStats)
          .set({ currentStreak: 0, multiplier: '1.0' })
          .where(eq(userStats.userId, userId))

        logger.info({ userId }, 'Streak reset — no check-in yesterday')
      }
    }
  },
})
