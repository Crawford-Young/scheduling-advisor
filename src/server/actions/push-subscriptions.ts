'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { pushSubscriptions } from '@/db/schema'
import { pushSubscriptionSchema } from '@/lib/schemas/push-subscription'
import { eq, and } from 'drizzle-orm'
import { logger } from '@/lib/logger'

export async function subscribeToPush(input: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const parsed = pushSubscriptionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const [sub] = await db
    .insert(pushSubscriptions)
    .values({ userId: session.user.id, ...parsed.data })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: parsed.data.p256dh, auth: parsed.data.auth },
    })
    .returning()

  logger.info({ userId: session.user.id }, 'Push subscription created')
  return { data: sub }
}

export async function unsubscribeFromPush(endpoint: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.userId, session.user.id), eq(pushSubscriptions.endpoint, endpoint)),
    )

  return { data: { success: true } }
}
