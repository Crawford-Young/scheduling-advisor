'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { checkIns } from '@/db/schema'
import { createCheckInSchema, completeCheckInSchema } from '@/lib/schemas/check-in'
import { eq, and } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'

export async function createCheckIn(input: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = createCheckInSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const [checkIn] = await db
    .insert(checkIns)
    .values({
      userId: session.user.id,
      taskId: parsed.data.taskId ?? null,
      scheduledAt: new Date(parsed.data.scheduledAt),
    })
    .returning()

  logger.info({ userId: session.user.id, checkInId: checkIn!.id }, 'Check-in created')
  return { data: checkIn }
}

export async function completeCheckIn(input: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const parsed = completeCheckInSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const [checkIn] = await db
    .update(checkIns)
    .set({
      completedAt: new Date(),
      rating: parsed.data.rating,
      reflectionText: parsed.data.reflectionText ?? null,
    })
    .where(and(eq(checkIns.id, parsed.data.id), eq(checkIns.userId, session.user.id)))
    .returning()

  if (!checkIn) return { error: 'Not found' }
  logger.info(
    { userId: session.user.id, checkInId: checkIn.id, rating: checkIn.rating },
    'Check-in completed',
  )
  return { data: checkIn }
}
