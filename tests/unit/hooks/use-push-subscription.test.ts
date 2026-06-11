import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePushSubscription } from '@/hooks/use-push-subscription'

const { mockSubscribeToPush, mockUnsubscribeFromPush } = vi.hoisted(() => ({
  mockSubscribeToPush: vi
    .fn()
    .mockResolvedValue({ data: { endpoint: 'https://push.example.com' } }),
  mockUnsubscribeFromPush: vi.fn().mockResolvedValue({ data: { success: true } }),
}))

vi.mock('@/server/actions/push-subscriptions', () => ({
  subscribeToPush: mockSubscribeToPush,
  unsubscribeFromPush: mockUnsubscribeFromPush,
}))

function makePushSubscription(endpoint = 'https://push.example.com') {
  return {
    endpoint,
    toJSON: () => ({
      endpoint,
      keys: { p256dh: 'key123', auth: 'auth456' },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription
}

function setupPushManager(opts: {
  supported?: boolean
  permission?: NotificationPermission
  subscription?: PushSubscription | null
}) {
  const { supported = true, permission = 'granted', subscription = null } = opts

  if (!supported) {
    Object.defineProperty(window, 'PushManager', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })
    return
  }

  Object.defineProperty(window, 'Notification', {
    value: { permission, requestPermission: vi.fn().mockResolvedValue(permission) },
    configurable: true,
    writable: true,
  })

  const mockSubscribe = vi.fn().mockResolvedValue(makePushSubscription())
  const mockGetSubscription = vi.fn().mockResolvedValue(subscription)

  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      ready: Promise.resolve({
        pushManager: { subscribe: mockSubscribe, getSubscription: mockGetSubscription },
      }),
    },
    configurable: true,
  })

  Object.defineProperty(window, 'PushManager', { value: class PushManager {}, configurable: true })

  return { mockSubscribe, mockGetSubscription }
}

describe('usePushSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns isSupported=false when PushManager unavailable', () => {
    setupPushManager({ supported: false })
    const { result } = renderHook(() => usePushSubscription())
    expect(result.current.isSupported).toBe(false)
  })

  it('returns isSupported=true when PushManager available', () => {
    setupPushManager({})
    const { result } = renderHook(() => usePushSubscription())
    expect(result.current.isSupported).toBe(true)
  })

  it('subscribe requests permission and calls subscribeToPush', async () => {
    const mocks = setupPushManager({ permission: 'granted' })!
    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      await result.current.subscribe('vapid-key')
    })

    expect(mocks.mockSubscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: 'vapid-key',
    })
    expect(mockSubscribeToPush).toHaveBeenCalled()
  })

  it('subscribe does nothing when permission denied', async () => {
    setupPushManager({ permission: 'denied' })
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'default', requestPermission: vi.fn().mockResolvedValue('denied') },
      configurable: true,
      writable: true,
    })
    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      await result.current.subscribe('vapid-key')
    })

    expect(mockSubscribeToPush).not.toHaveBeenCalled()
  })

  it('unsubscribe calls unsubscribeFromPush with endpoint', async () => {
    const sub = makePushSubscription('https://push.example.com/sub')
    setupPushManager({ subscription: sub })
    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      await result.current.unsubscribe()
    })

    expect(mockUnsubscribeFromPush).toHaveBeenCalledWith('https://push.example.com/sub')
  })

  it('unsubscribe is no-op when no active subscription', async () => {
    setupPushManager({ subscription: null })
    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      await result.current.unsubscribe()
    })

    expect(mockUnsubscribeFromPush).not.toHaveBeenCalled()
  })

  it('subscribe is no-op when not supported', async () => {
    setupPushManager({ supported: false })
    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      await result.current.subscribe('vapid-key')
    })

    expect(mockSubscribeToPush).not.toHaveBeenCalled()
  })

  it('unsubscribe is no-op when not supported', async () => {
    setupPushManager({ supported: false })
    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      await result.current.unsubscribe()
    })

    expect(mockUnsubscribeFromPush).not.toHaveBeenCalled()
  })

  it('subscribe uses empty string fallback when subscription keys absent', async () => {
    setupPushManager({ permission: 'granted' })
    const subWithNoKeys = {
      endpoint: 'https://push.example.com',
      toJSON: () => ({ endpoint: 'https://push.example.com' }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    } as unknown as PushSubscription
    const mocks = setupPushManager({})!
    mocks.mockSubscribe.mockResolvedValue(subWithNoKeys)

    const { result } = renderHook(() => usePushSubscription())
    await act(async () => {
      await result.current.subscribe('vapid-key')
    })

    expect(mockSubscribeToPush).toHaveBeenCalledWith({
      endpoint: 'https://push.example.com',
      p256dh: '',
      auth: '',
    })
  })
})
