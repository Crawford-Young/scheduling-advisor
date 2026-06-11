export interface PushSubscriptionData {
  endpoint: string
  p256dh: string
  auth: string
}

export interface NotificationPayload {
  title: string
  body: string
  url?: string
}

export interface NotificationService {
  sendPush(subscription: PushSubscriptionData, payload: NotificationPayload): Promise<void>
}
