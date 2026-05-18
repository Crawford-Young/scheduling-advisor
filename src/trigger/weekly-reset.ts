import { schedules } from '@trigger.dev/sdk/v3'
import { db } from '@/db'
import { userStats } from '@/db/schema'
import { logger } from '@/lib/logger'

export const weeklyResetTask = schedules.task({
  id: 'weekly-points-reset',
  cron: '55 23 * * 0',
  run: async () => {
    const result = await db
      .update(userStats)
      .set({ weeklyPoints: 0 })
      .returning({ userId: userStats.userId, previousWeeklyPoints: userStats.weeklyPoints })

    logger.info({ usersReset: result.length }, 'Weekly points reset complete')
  },
})
