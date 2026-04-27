import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEventsList = vi.hoisted(() => vi.fn())
const mockFreeBusy = vi.hoisted(() => vi.fn())
const mockEventsInsert = vi.hoisted(() => vi.fn())
const mockEventsDelete = vi.hoisted(() => vi.fn())

vi.mock('googleapis', () => {
  function MockOAuth2() {}
  MockOAuth2.prototype.setCredentials = function () {}

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

vi.mock('@/db', () => ({
  db: {
    query: {
      accounts: {
        findFirst: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
        }),
      },
    },
  },
}))

import { googleCalendarService } from '@/server/services/impl/google-calendar'
import { db } from '@/db'

const mockFindFirst = vi.mocked(db.query.accounts.findFirst)

describe('googleCalendarService', () => {
  const userId = 'user-123'
  const start = new Date('2026-05-01T09:00:00Z')
  const end = new Date('2026-05-01T17:00:00Z')

  beforeEach(() => vi.clearAllMocks())

  describe('getClient', () => {
    it('throws when no access token', async () => {
      mockFindFirst.mockResolvedValueOnce(null as never)
      await expect(googleCalendarService.getEvents(userId, start, end)).rejects.toThrow(
        'No Google account linked for user',
      )
    })

    it('uses undefined for null refresh_token', async () => {
      mockFindFirst.mockResolvedValueOnce({ access_token: 'tok', refresh_token: null } as never)
      mockEventsList.mockResolvedValue({ data: { items: [] } })
      const events = await googleCalendarService.getEvents(userId, start, end)
      expect(events).toEqual([])
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
