import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/env', () => ({ env: { TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64') } }))

const mockFindFirst = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockSet = vi.hoisted(() => vi.fn())
const mockWhere = vi.hoisted(() => vi.fn())
vi.mock('@/db', () => ({
  db: {
    query: { accounts: { findFirst: mockFindFirst } },
    update: mockUpdate.mockReturnValue({ set: mockSet.mockReturnValue({ where: mockWhere }) }),
  },
}))

import { syncGoogleAccount, encryptAccountTokenFields } from '@/lib/google-account-sync'
import { decryptToken, isEncrypted } from '@/lib/token-crypto'
import type { Account } from 'next-auth'

const EVENTS = 'https://www.googleapis.com/auth/calendar.events'
const FREEBUSY = 'https://www.googleapis.com/auth/calendar.freebusy'

function makeAccount(overrides: Partial<Account>): Account {
  return {
    provider: 'google',
    providerAccountId: 'gid-1',
    type: 'oidc',
    ...overrides,
  } as Account
}

describe('encryptAccountTokenFields', () => {
  it('encrypts present token fields, leaves absent/null untouched', () => {
    const out = encryptAccountTokenFields({ access_token: 'at', refresh_token: null })
    expect(isEncrypted(out.access_token as string)).toBe(true)
    expect(decryptToken(out.access_token as string)).toBe('at')
    expect(out.refresh_token).toBeNull()
  })

  it('encrypts refresh_token and leaves absent access_token untouched', () => {
    const out = encryptAccountTokenFields({ refresh_token: 'rt' })
    expect(isEncrypted(out.refresh_token as string)).toBe(true)
    expect(decryptToken(out.refresh_token as string)).toBe('rt')
    expect(out.access_token).toBeUndefined()
  })
})

describe('syncGoogleAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockReturnValue({ set: mockSet.mockReturnValue({ where: mockWhere }) })
  })

  it('merges scope union and keeps existing refresh_token when payload lacks one (base re-login)', async () => {
    mockFindFirst.mockResolvedValue({
      scope: `openid email profile ${EVENTS} ${FREEBUSY}`,
      refresh_token: 'v1:keep',
    })
    await syncGoogleAccount(
      makeAccount({
        access_token: 'fresh-at',
        expires_at: 1753500000,
        scope: 'openid email profile',
      }),
    )
    const setArg = mockSet.mock.calls[0]![0]
    expect(setArg.scope).toBe(`openid email profile ${EVENTS} ${FREEBUSY}`)
    expect(setArg.refresh_token).toBeUndefined() // not overwritten
    expect(decryptToken(setArg.access_token)).toBe('fresh-at')
    expect(setArg.expires_at).toBe(1753500000)
  })

  it('persists new refresh_token + calendar scopes on connect-flow sign-in', async () => {
    mockFindFirst.mockResolvedValue({ scope: 'openid email profile', refresh_token: null })
    await syncGoogleAccount(
      makeAccount({
        access_token: 'at2',
        refresh_token: 'rt2',
        expires_at: 1753500001,
        scope: `openid email profile ${EVENTS} ${FREEBUSY}`,
      }),
    )
    const setArg = mockSet.mock.calls[0]![0]
    expect(decryptToken(setArg.refresh_token)).toBe('rt2')
    expect(setArg.scope).toContain(EVENTS)
  })

  it('writes a scope-only update when the payload carries no tokens', async () => {
    mockFindFirst.mockResolvedValue({ scope: 'openid', refresh_token: null })
    await syncGoogleAccount(makeAccount({ scope: 'openid email' }))
    const setArg = mockSet.mock.calls[0]![0]
    expect(setArg).toEqual({ scope: 'openid email' })
  })

  it('no-ops when no existing row', async () => {
    mockFindFirst.mockResolvedValue(undefined)
    await syncGoogleAccount(makeAccount({ access_token: 'x' }))
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
