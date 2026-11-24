import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))

vi.mock('@/server/generation', () => ({
  generateEvents: vi.fn().mockResolvedValue(0),
}))

vi.mock('@/lib/report-error', () => ({ reportError: vi.fn(), reportMessage: vi.fn() }))

import { safeGenerateEvents } from '@/server/actions/event-generation'
import { generateEvents } from '@/server/generation'
import { reportError } from '@/lib/report-error'

describe('module export shape', () => {
  it('every export from event-generation is a function (use server contract)', async () => {
    const mod = await import('@/server/actions/event-generation')
    for (const [name, value] of Object.entries(mod)) {
      expect(typeof value, `export "${name}" must be a function`).toBe('function')
    }
  })

  it('exports exactly one function: safeGenerateEvents (zero-arg, auth-gated)', async () => {
    const mod = await import('@/server/actions/event-generation')
    expect(Object.keys(mod)).toEqual(['safeGenerateEvents'])
  })
})

describe('safeGenerateEvents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no-ops when unauthenticated — never derives userId from a caller-supplied value', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)

    await expect(safeGenerateEvents()).resolves.toBeUndefined()

    expect(generateEvents).not.toHaveBeenCalled()
    expect(reportError).not.toHaveBeenCalled()
  })

  it('calls generateEvents with the session-derived userId on success', async () => {
    vi.mocked(generateEvents).mockResolvedValueOnce(3)

    await expect(safeGenerateEvents()).resolves.toBeUndefined()

    expect(generateEvents).toHaveBeenCalledWith('user-123')
    expect(reportError).not.toHaveBeenCalled()
  })

  it('swallows a thrown error and reports it', async () => {
    const dbError = new Error('db unreachable')
    vi.mocked(generateEvents).mockRejectedValueOnce(dbError)

    await expect(safeGenerateEvents()).resolves.toBeUndefined()

    expect(reportError).toHaveBeenCalledWith(dbError)
  })
})
