import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/services/impl/google-calendar', () => ({
  googleCalendarService: {
    getEvents: vi.fn(),
    getFreeSlots: vi.fn(),
    createEvent: vi.fn(),
    deleteEvent: vi.fn(),
  },
}))

vi.mock('@/server/services/impl/web-push', () => ({
  webPushService: { sendPush: vi.fn() },
}))

import { getCalendarService, getNotificationService, _resetServices } from '@/server/services'

describe('getCalendarService', () => {
  beforeEach(() => _resetServices())

  it('returns google-calendar impl by default', async () => {
    const svc = await getCalendarService()
    expect(svc).toBeDefined()
    expect(typeof svc.getEvents).toBe('function')
  })

  it('returns cached instance on second call', async () => {
    const svc1 = await getCalendarService()
    const svc2 = await getCalendarService()
    expect(svc1).toBe(svc2)
  })

  it('throws for unknown impl', async () => {
    vi.stubEnv('CALENDAR_SERVICE_IMPL', 'unknown')
    await expect(getCalendarService()).rejects.toThrow('Unknown CALENDAR_SERVICE_IMPL: unknown')
    vi.unstubAllEnvs()
  })
})

describe('getNotificationService', () => {
  beforeEach(() => _resetServices())

  it('returns web-push impl by default', async () => {
    const svc = await getNotificationService()
    expect(svc).toBeDefined()
    expect(typeof svc.sendPush).toBe('function')
  })

  it('returns cached instance on second call', async () => {
    const svc1 = await getNotificationService()
    const svc2 = await getNotificationService()
    expect(svc1).toBe(svc2)
  })

  it('throws for unknown impl', async () => {
    vi.stubEnv('NOTIFICATION_SERVICE_IMPL', 'unknown')
    await expect(getNotificationService()).rejects.toThrow(
      'Unknown NOTIFICATION_SERVICE_IMPL: unknown',
    )
    vi.unstubAllEnvs()
  })
})
