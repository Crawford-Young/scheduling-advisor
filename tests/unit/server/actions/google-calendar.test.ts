import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/env', () => ({ env: { TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64') } }))
const mockAuth = vi.hoisted(() => vi.fn())
const mockSignIn = vi.hoisted(() => vi.fn())
vi.mock('@/auth', () => ({ auth: mockAuth, signIn: mockSignIn }))
const mockLimit = vi.hoisted(() => vi.fn())
vi.mock('@/lib/redis', () => ({ ratelimit: { limit: mockLimit } }))
const mockFindFirst = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockSet = vi.hoisted(() => vi.fn())
const mockWhere = vi.hoisted(() => vi.fn())
vi.mock('@/db', () => ({
  db: {
    query: { accounts: { findFirst: mockFindFirst } },
    update: mockUpdate,
  },
}))
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { connectGoogleCalendar, disconnectGoogleCalendar } from '@/server/actions/google-calendar'
import { CALENDAR_CONNECT_SCOPE } from '@/lib/google-calendar-scopes'
import { encryptToken } from '@/lib/token-crypto'

describe('google-calendar actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockLimit.mockResolvedValue({ success: true })
    mockUpdate.mockReturnValue({ set: mockSet.mockReturnValue({ where: mockWhere }) })
    mockFetch.mockResolvedValue({ ok: true })
  })

  describe('connectGoogleCalendar', () => {
    it('rejects unauthenticated', async () => {
      mockAuth.mockResolvedValueOnce(null as never)
      await expect(connectGoogleCalendar('/settings')).rejects.toThrow('Unauthorized')
    })
    it('fires signIn with elevated authorization params', async () => {
      await connectGoogleCalendar('/settings')
      expect(mockSignIn).toHaveBeenCalledWith(
        'google',
        { redirectTo: '/settings' },
        {
          scope: CALENDAR_CONNECT_SCOPE,
          access_type: 'offline',
          prompt: 'consent',
          include_granted_scopes: 'true',
        },
      )
    })
    it('sanitizes non-relative redirectTo to /', async () => {
      await connectGoogleCalendar('https://evil.example')
      expect(mockSignIn).toHaveBeenCalledWith('google', { redirectTo: '/' }, expect.anything())
    })
    it('sanitizes protocol-relative redirectTo to /', async () => {
      await connectGoogleCalendar('//evil.example')
      expect(mockSignIn).toHaveBeenCalledWith('google', { redirectTo: '/' }, expect.anything())
    })
    it('rate limits', async () => {
      mockLimit.mockResolvedValueOnce({ success: false })
      await expect(connectGoogleCalendar('/settings')).rejects.toThrow('Too many requests')
    })
  })

  describe('disconnectGoogleCalendar', () => {
    it('revokes decrypted refresh token via POST body and clears fields', async () => {
      mockFindFirst.mockResolvedValue({
        refresh_token: encryptToken('rt-plain'),
        scope:
          'openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy',
      })
      await disconnectGoogleCalendar()
      // The repo's MSW server (tests/setup.ts) intercepts the global fetch and,
      // on passthrough for an unhandled request, re-invokes it with a single
      // normalized Request object rather than the (url, init) pair our code
      // called it with — read the call in that shape.
      const [request] = mockFetch.mock.calls[0]! as [Request]
      expect(request.url).toBe('https://oauth2.googleapis.com/revoke')
      expect(request.method).toBe('POST')
      expect(await request.text()).toBe(`token=${encodeURIComponent('rt-plain')}`)
      expect(request.url).not.toContain('rt-plain')
      const setArg = mockSet.mock.calls[0]![0]
      expect(setArg).toMatchObject({
        access_token: null,
        refresh_token: null,
        expires_at: null,
        scope: 'openid email profile',
      })
    })
    it('clears fields even when revoke fetch rejects', async () => {
      mockFindFirst.mockResolvedValue({ refresh_token: encryptToken('rt'), scope: 'openid' })
      mockFetch.mockRejectedValueOnce(new Error('network'))
      await disconnectGoogleCalendar()
      expect(mockSet).toHaveBeenCalled()
    })
    it('skips revoke call when no refresh token, still clears', async () => {
      mockFindFirst.mockResolvedValue({ refresh_token: null, scope: 'openid' })
      await disconnectGoogleCalendar()
      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockSet).toHaveBeenCalled()
    })
    it('rate limits', async () => {
      mockLimit.mockResolvedValueOnce({ success: false })
      await expect(disconnectGoogleCalendar()).rejects.toThrow('Too many requests')
    })
    it('rejects unauthenticated', async () => {
      mockAuth.mockResolvedValueOnce(null as never)
      await expect(disconnectGoogleCalendar()).rejects.toThrow('Unauthorized')
    })
  })
})
