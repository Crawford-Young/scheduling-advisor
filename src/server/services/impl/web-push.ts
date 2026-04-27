import webpush from 'web-push'
import { env } from '@/env'
import { logger } from '@/lib/logger'
import type {
  NotificationService,
  PushSubscriptionData,
  NotificationPayload,
} from '../interfaces/notification'

webpush.setVapidDetails(
  `mailto:${env.VAPID_EMAIL}`,
  env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  env.VAPID_PRIVATE_KEY,
)

export const webPushService: NotificationService = {
  async sendPush(subscription: PushSubscriptionData, payload: NotificationPayload) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          url: payload.url ?? '/',
        }),
      )
    } catch (err) {
      logger.error({ err, endpoint: subscription.endpoint }, 'Push notification failed')
      throw err
    }
  },
}
