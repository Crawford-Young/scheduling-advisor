import { describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}))

vi.mock('@/server/queries/tokens', () => ({
  getTokenBalance: vi.fn().mockResolvedValue(42),
}))

describe('getTokenBalanceAction', () => {
  it('returns token balance for current user', async () => {
    const { getTokenBalanceAction } = await import('./tokens')
    const result = await getTokenBalanceAction()
    expect(result).toBe(42)
  })

  it('throws if unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null)
    const { getTokenBalanceAction } = await import('./tokens')
    await expect(getTokenBalanceAction()).rejects.toThrow('Unauthorized')
  })
})
