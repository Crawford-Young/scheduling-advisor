import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendNotification = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockSetVapidDetails = vi.hoisted(() => vi.fn())

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
}))

vi.mock('@/env', () => ({
  env: {
    VAPID_EMAIL: 'test@example.com',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'public-key',
    VAPID_PRIVATE_KEY: 'private-key',
  },
}))

import { webPushService } from '@/server/services/impl/web-push'

const sub = { endpoint: 'https://fcm.example.com/send/abc', p256dh: 'p256', auth: 'auth' }

describe('webPushService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends notification with correct subscription and payload', async () => {
    await webPushService.sendPush(sub, { title: 'Check-in time', body: 'How did today go?' })

    expect(mockSendNotification).toHaveBeenCalledWith(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title: 'Check-in time', body: 'How did today go?', url: '/' }),
    )
  })

  it('includes custom url in payload when provided', async () => {
    await webPushService.sendPush(sub, {
      title: 'Check-in',
      body: 'Reflect',
      url: '/dashboard',
    })

    const call = mockSendNotification.mock.calls[0]!
    const payload = JSON.parse(call[1] as string) as { url: string }
    expect(payload.url).toBe('/dashboard')
  })

  it('throws when sendNotification rejects', async () => {
    mockSendNotification.mockRejectedValueOnce(new Error('Network error'))
    await expect(webPushService.sendPush(sub, { title: 'Fail', body: 'Fail' })).rejects.toThrow(
      'Network error',
    )
  })
})
