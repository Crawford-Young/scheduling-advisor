import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/env', () => ({ env: { TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64') } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const mockEventsList = vi.hoisted(() => vi.fn())
const mockFreeBusy = vi.hoisted(() => vi.fn())
const mockEventsInsert = vi.hoisted(() => vi.fn())
const mockEventsDelete = vi.hoisted(() => vi.fn())

interface RefreshedTokens {
  access_token?: string | null
  expiry_date?: number | null
}
type TokensListener = (tokens: RefreshedTokens) => void

let capturedCredentials: unknown
let capturedTokensListener: TokensListener | undefined

vi.mock('googleapis', () => {
  function MockOAuth2() {}
  MockOAuth2.prototype.setCredentials = function (credentials: unknown) {
    capturedCredentials = credentials
  }
  MockOAuth2.prototype.on = function (event: string, listener: TokensListener) {
    if (event === 'tokens') capturedTokensListener = listener
  }

  return {
    google: {
      auth: { OAuth2: MockOAuth2 },
      calendar: vi.fn().mockReturnValue({
        events: {
          list: mockEventsList,
          insert: mockEventsInsert,
          delete: mockEventsDelete,
        },
        freebusy: { query: mockFreeBusy },
      }),
    },
  }
})

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

import { googleCalendarService } from '@/server/services/impl/google-calendar'
import { CalendarNotConnectedError } from '@/server/services/errors'
import { encryptToken, decryptToken } from '@/lib/token-crypto'
import { logger } from '@/lib/logger'

const FULL_SCOPE =
  'openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy'

describe('googleCalendarService', () => {
  const userId = 'user-123'
  const start = new Date('2026-05-01T09:00:00Z')
  const end = new Date('2026-05-01T17:00:00Z')

  beforeEach(() => {
    vi.clearAllMocks()
    capturedCredentials = undefined
    capturedTokensListener = undefined
    mockFindFirst.mockResolvedValue({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: 1753500000,
      scope: FULL_SCOPE,
    })
    mockUpdate.mockReturnValue({ set: mockSet.mockReturnValue({ where: mockWhere }) })
  })

  describe('getClient', () => {
    it('throws CalendarNotConnectedError when no account row', async () => {
      mockFindFirst.mockResolvedValueOnce(null)
      await expect(googleCalendarService.getEvents(userId, start, end)).rejects.toBeInstanceOf(
        CalendarNotConnectedError,
      )
    })

    it('throws CalendarNotConnectedError when calendar scopes missing', async () => {
      mockFindFirst.mockResolvedValueOnce({
        access_token: 'at',
        refresh_token: 'rt',
        scope: 'openid email profile',
      })
      await expect(googleCalendarService.getEvents(userId, start, end)).rejects.toBeInstanceOf(
        CalendarNotConnectedError,
      )
    })

    it('uses undefined for null refresh_token and absent expires_at', async () => {
      mockFindFirst.mockResolvedValueOnce({
        access_token: 'tok',
        refresh_token: null,
        scope: FULL_SCOPE,
      })
      mockEventsList.mockResolvedValue({ data: { items: [] } })
      const events = await googleCalendarService.getEvents(userId, start, end)
      expect(events).toEqual([])
      expect(capturedCredentials).toEqual({
        access_token: 'tok',
        refresh_token: undefined,
        expiry_date: undefined,
      })
    })

    it('decrypts stored tokens and sets expiry_date in ms', async () => {
      mockFindFirst.mockResolvedValueOnce({
        access_token: encryptToken('plain-at'),
        refresh_token: encryptToken('plain-rt'),
        expires_at: 1753500000,
        scope: FULL_SCOPE,
      })
      mockEventsList.mockResolvedValueOnce({ data: { items: [] } })
      await googleCalendarService.getEvents(userId, start, end)
      expect(capturedCredentials).toEqual({
        access_token: 'plain-at',
        refresh_token: 'plain-rt',
        expiry_date: 1753500000 * 1000,
      })
    })
  })

  describe('token refresh persistence', () => {
    it('persists refreshed tokens from the tokens event, encrypted', async () => {
      mockEventsList.mockResolvedValueOnce({ data: { items: [] } })
      await googleCalendarService.getEvents(userId, start, end)
      await capturedTokensListener!({ access_token: 'refreshed-at', expiry_date: 1753600000000 })
      const setArg = mockSet.mock.calls[0]![0]
      expect(decryptToken(setArg.access_token)).toBe('refreshed-at')
      expect(setArg.expires_at).toBe(1753600000)
    })

    it('ignores a tokens event carrying nothing to persist', async () => {
      mockEventsList.mockResolvedValueOnce({ data: { items: [] } })
      await googleCalendarService.getEvents(userId, start, end)
      await capturedTokensListener!({})
      expect(mockSet).not.toHaveBeenCalled()
    })

    it('logs instead of throwing when the refresh persist fails', async () => {
      mockEventsList.mockResolvedValueOnce({ data: { items: [] } })
      await googleCalendarService.getEvents(userId, start, end)
      mockWhere.mockRejectedValueOnce(new Error('db down'))
      capturedTokensListener!({ access_token: 'refreshed-at' })
      await vi.waitFor(() =>
        expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
          expect.objectContaining({ userId }),
          'Failed to persist refreshed Google tokens',
        ),
      )
    })
  })

  describe('revocation handling', () => {
    it('invalid_grant clears tokens, strips calendar scopes, throws CalendarNotConnectedError', async () => {
      mockEventsList.mockRejectedValueOnce({ response: { data: { error: 'invalid_grant' } } })
      await expect(googleCalendarService.getEvents(userId, start, end)).rejects.toBeInstanceOf(
        CalendarNotConnectedError,
      )
      const setArg = mockSet.mock.calls[0]![0]
      expect(setArg.access_token).toBeNull()
      expect(setArg.refresh_token).toBeNull()
      expect(setArg.expires_at).toBeNull()
      expect(setArg.scope).toBe('openid email profile')
    })

    it('treats an invalid_grant error message as revocation', async () => {
      mockEventsList.mockRejectedValueOnce(new Error('invalid_grant: token has been revoked'))
      await expect(googleCalendarService.getEvents(userId, start, end)).rejects.toBeInstanceOf(
        CalendarNotConnectedError,
      )
      expect(mockSet).toHaveBeenCalled()
    })

    it('clears to an empty scope when the account row is gone', async () => {
      mockFindFirst
        .mockResolvedValueOnce({
          access_token: 'at',
          refresh_token: 'rt',
          expires_at: 1753500000,
          scope: FULL_SCOPE,
        })
        .mockResolvedValueOnce(undefined)
      mockEventsList.mockRejectedValueOnce({ response: { data: { error: 'invalid_grant' } } })
      await expect(googleCalendarService.getEvents(userId, start, end)).rejects.toBeInstanceOf(
        CalendarNotConnectedError,
      )
      const setArg = mockSet.mock.calls[0]![0]
      expect(setArg.scope).toBe('')
    })

    it('rethrows non-revocation errors untouched', async () => {
      mockEventsList.mockRejectedValueOnce(new Error('boom'))
      await expect(googleCalendarService.getEvents(userId, start, end)).rejects.toThrow('boom')
      expect(mockSet).not.toHaveBeenCalled()
    })

    it('rethrows a messageless non-Error rejection untouched', async () => {
      const rejection = { status: 503 }
      mockEventsList.mockRejectedValueOnce(rejection)
      await expect(googleCalendarService.getEvents(userId, start, end)).rejects.toBe(rejection)
      expect(mockSet).not.toHaveBeenCalled()
    })
  })

  describe('getEvents', () => {
    it('returns mapped events', async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: 'evt-1',
              summary: 'Team standup',
              start: { dateTime: '2026-05-01T09:00:00Z' },
              end: { dateTime: '2026-05-01T09:30:00Z' },
            },
          ],
        },
      })

      const events = await googleCalendarService.getEvents(userId, start, end)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        id: 'evt-1',
        title: 'Team standup',
        calendarId: 'primary',
      })
      expect(events[0]!.start).toBeInstanceOf(Date)
    })

    it('returns empty array when no items', async () => {
      mockEventsList.mockResolvedValue({ data: { items: null } })
      const events = await googleCalendarService.getEvents(userId, start, end)
      expect(events).toEqual([])
    })

    it('falls back to date when dateTime missing', async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: null,
              summary: null,
              start: { date: '2026-05-01' },
              end: { date: '2026-05-02' },
            },
          ],
        },
      })
      const events = await googleCalendarService.getEvents(userId, start, end)
      expect(events[0]!.id).toBe('')
      expect(events[0]!.title).toBe('(No title)')
    })

    it('falls back to empty string when all start/end fields missing', async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [{ id: 'evt', summary: 'Test', start: {}, end: {} }],
        },
      })
      const events = await googleCalendarService.getEvents(userId, start, end)
      expect(events[0]!.id).toBe('evt')
    })
  })

  describe('getFreeSlots', () => {
    it('returns free slot between busy blocks', async () => {
      mockFreeBusy.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: '2026-05-01T09:00:00Z', end: '2026-05-01T10:00:00Z' },
                { start: '2026-05-01T12:00:00Z', end: '2026-05-01T13:00:00Z' },
              ],
            },
          },
        },
      })

      const slots = await googleCalendarService.getFreeSlots(userId, start, end, 30)
      expect(slots.length).toBeGreaterThan(0)
      const bigSlot = slots.find((s) => s.durationMinutes === 120)
      expect(bigSlot).toBeDefined()
    })

    it('filters out slots shorter than minDurationMinutes', async () => {
      mockFreeBusy.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: '2026-05-01T09:00:00Z', end: '2026-05-01T10:50:00Z' },
                { start: '2026-05-01T11:00:00Z', end: '2026-05-01T17:00:00Z' },
              ],
            },
          },
        },
      })

      const slots = await googleCalendarService.getFreeSlots(userId, start, end, 30)
      expect(slots.every((s) => s.durationMinutes >= 30)).toBe(true)
    })

    it('returns empty array when no calendars in response', async () => {
      mockFreeBusy.mockResolvedValue({ data: { calendars: null } })
      const slots = await googleCalendarService.getFreeSlots(userId, start, end, 30)
      expect(slots.length).toBeGreaterThan(0)
    })

    it('skips advancing cursor when blockEnd is before cursor', async () => {
      mockFreeBusy.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: '2026-05-01T09:00:00Z', end: '2026-05-01T12:00:00Z' },
                { start: null, end: null },
              ],
            },
          },
        },
      })
      const slots = await googleCalendarService.getFreeSlots(userId, start, end, 30)
      expect(slots).toBeDefined()
    })

    it('discards trailing slot below minDuration threshold', async () => {
      const tightEnd = new Date('2026-05-01T09:10:00Z')
      mockFreeBusy.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [{ start: '2026-05-01T09:00:00Z', end: '2026-05-01T09:05:00Z' }],
            },
          },
        },
      })
      const slots = await googleCalendarService.getFreeSlots(userId, start, tightEnd, 30)
      expect(slots.every((s) => s.durationMinutes >= 30)).toBe(true)
    })
  })

  describe('createEvent', () => {
    it('creates and returns the event', async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: 'new-evt',
          summary: 'Run 5k',
          start: { dateTime: '2026-05-01T07:00:00Z' },
          end: { dateTime: '2026-05-01T08:00:00Z' },
        },
      })

      const event = await googleCalendarService.createEvent(userId, {
        title: 'Run 5k',
        start: new Date('2026-05-01T07:00:00Z'),
        end: new Date('2026-05-01T08:00:00Z'),
      })

      expect(event.id).toBe('new-evt')
      expect(event.title).toBe('Run 5k')
    })

    it('falls back to empty strings when response fields are null', async () => {
      mockEventsInsert.mockResolvedValue({
        data: { id: null, summary: null, start: null, end: null },
      })

      const event = await googleCalendarService.createEvent(userId, {
        title: 'Test',
        start: new Date('2026-05-01T07:00:00Z'),
        end: new Date('2026-05-01T08:00:00Z'),
      })

      expect(event.id).toBe('')
      expect(event.title).toBe('')
    })
  })

  describe('deleteEvent', () => {
    it('calls delete with correct params', async () => {
      mockEventsDelete.mockResolvedValue({})
      await googleCalendarService.deleteEvent(userId, 'evt-to-delete')
      expect(mockEventsDelete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'evt-to-delete',
      })
    })
  })
})
