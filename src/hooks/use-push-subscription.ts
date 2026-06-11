'use client'
import { subscribeToPush, unsubscribeFromPush } from '@/server/actions/push-subscriptions'

export function usePushSubscription() {
  const isSupported =
    typeof window !== 'undefined' && !!window.PushManager && !!navigator.serviceWorker

  async function subscribe(vapidPublicKey: string) {
    if (!isSupported) return

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKey,
    })

    const json = subscription.toJSON()
    await subscribeToPush({
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    })
  }

  async function unsubscribe() {
    if (!isSupported) return

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return

    await subscription.unsubscribe()
    await unsubscribeFromPush(subscription.endpoint)
  }

  return { isSupported, subscribe, unsubscribe }
}
