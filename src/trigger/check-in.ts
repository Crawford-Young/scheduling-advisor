import { schedules } from '@trigger.dev/sdk/v3'
import { db } from '@/db'
import { checkIns, pushSubscriptions } from '@/db/schema'
import { isNull, eq } from 'drizzle-orm'
import { logger } from '@/lib/logger'
import { getNotificationService } from '@/server/services'

export const checkInNotificationJob = schedules.task({
  id: 'check-in-notification',
  cron: '0 8 * * *',
  run: async () => {
    const pending = await db.select().from(checkIns).where(isNull(checkIns.completedAt))

    logger.info({ count: pending.length }, 'Sending check-in notifications')

    const pushService = await getNotificationService()

    for (const checkIn of pending) {
      const subs = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, checkIn.userId))

      for (const sub of subs) {
        await pushService.sendPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          { title: 'Time for a check-in!', body: "How's your progress today?" },
        )
      }
    }
  },
})
