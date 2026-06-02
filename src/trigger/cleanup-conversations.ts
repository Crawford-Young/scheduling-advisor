import { schedules } from '@trigger.dev/sdk/v3'
import { db } from '@/db'
import { conversations } from '@/db/schema'
import { or, lt, isNotNull } from 'drizzle-orm'
import { logger } from '@/lib/logger'

export const cleanupConversationsJob = schedules.task({
  id: 'cleanup-conversations',
  cron: '0 3 * * 0',
  run: async () => {
    const result = await db
      .delete(conversations)
      .where(or(lt(conversations.expiresAt, new Date()), isNotNull(conversations.deletedAt)))

    logger.info({ result }, 'Cleaned up expired/deleted conversations')
  },
})
