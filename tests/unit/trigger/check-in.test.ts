import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDbSelect, mockSendPush } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockSendPush: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@trigger.dev/sdk/v3', () => ({
  schedules: {
    task: (opts: { id: string; run: (payload: unknown) => Promise<void> }) => ({
      id: opts.id,
      run: opts.run,
    }),
  },
}))

vi.mock('@/db', () => ({ db: { select: mockDbSelect } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))
vi.mock('@/server/services', () => ({
  getNotificationService: vi.fn().mockResolvedValue({ sendPush: mockSendPush }),
}))

type RunFn = { run: (payload: unknown) => Promise<void> }

const pendingCheckIn = {
  id: 'ci-1',
  userId: 'user-1',
  completedAt: null,
}

const pushSub = {
  endpoint: 'https://push.example.com',
  p256dh: 'key',
  auth: 'auth',
}

function setupSelectSequence(firstRows: unknown[], secondRows: unknown[]) {
  let call = 0
  const mockWhere = vi.fn().mockImplementation(() => (++call === 1 ? firstRows : secondRows))
  mockDbSelect.mockReturnValue({ from: vi.fn().mockReturnValue({ where: mockWhere }) })
}

describe('checkInNotificationJob', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends push for each pending check-in and subscription', async () => {
    setupSelectSequence([pendingCheckIn], [pushSub])
    const { checkInNotificationJob } = await import('@/trigger/check-in')
    await (checkInNotificationJob as unknown as RunFn).run({})

    expect(mockSendPush).toHaveBeenCalledOnce()
    expect(mockSendPush).toHaveBeenCalledWith(
      { endpoint: pushSub.endpoint, p256dh: pushSub.p256dh, auth: pushSub.auth },
      { title: 'Time for a check-in!', body: "How's your progress today?" },
    )
  })

  it('does nothing when no pending check-ins', async () => {
    setupSelectSequence([], [])
    const { checkInNotificationJob } = await import('@/trigger/check-in')
    await (checkInNotificationJob as unknown as RunFn).run({})
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  it('skips user with no push subscriptions', async () => {
    setupSelectSequence([pendingCheckIn], [])
    const { checkInNotificationJob } = await import('@/trigger/check-in')
    await (checkInNotificationJob as unknown as RunFn).run({})
    expect(mockSendPush).not.toHaveBeenCalled()
  })
})
