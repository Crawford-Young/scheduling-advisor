import { http, HttpResponse } from 'msw'

const mockEvents = [
  {
    id: 'evt-standup',
    title: 'Team standup',
    start: '2026-05-04T09:00:00Z',
    end: '2026-05-04T09:30:00Z',
    calendarId: 'primary',
  },
]

const mockFreeSlots = [
  { start: '2026-05-04T07:00:00Z', end: '2026-05-04T08:30:00Z', durationMinutes: 90 },
  { start: '2026-05-05T07:00:00Z', end: '2026-05-05T08:00:00Z', durationMinutes: 60 },
]

export const handlers = [
  http.get('/api/calendar/events', () => {
    return HttpResponse.json({ events: mockEvents })
  }),

  http.get('/api/calendar/free-slots', () => {
    return HttpResponse.json({ slots: mockFreeSlots })
  }),

  http.post('/api/calendar/events', async ({ request }) => {
    const body = (await request.json()) as { title: string; start: string; end: string }
    return HttpResponse.json({
      event: {
        id: 'new-evt-' + Date.now(),
        title: body.title,
        start: body.start,
        end: body.end,
        calendarId: 'primary',
      },
    })
  }),

  http.post('/api/push', () => {
    return HttpResponse.json({ success: true })
  }),

  http.post('/api/chat', () =>
    HttpResponse.text('0:"Hello!"\n', {
      headers: { 'content-type': 'text/event-stream' },
    }),
  ),
]
