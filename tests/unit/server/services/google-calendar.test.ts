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

describe('googleCalendarService', () => {
  const userId = 'user-123'
  const start = new Date('2026-05-01T09:00:00Z')
  const end = new Date('2026-05-01T17:00:00Z')

  beforeEach(() => vi.clearAllMocks())

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
