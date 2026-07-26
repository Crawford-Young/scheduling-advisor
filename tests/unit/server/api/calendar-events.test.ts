import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
vi.mock('@/auth', () => ({ auth: mockAuth }))
const mockLimit = vi.hoisted(() => vi.fn())
vi.mock('@/lib/redis', () => ({ ratelimit: { limit: mockLimit } }))
const mockGetEvents = vi.hoisted(() => vi.fn())
const mockCreateEvent = vi.hoisted(() => vi.fn())
vi.mock('@/server/services', () => ({
  getCalendarService: vi.fn().mockResolvedValue({
    getEvents: mockGetEvents,
    createEvent: mockCreateEvent,
  }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/calendar/events/route'
import { CalendarNotConnectedError } from '@/server/services/errors'

function getReq(): NextRequest {
  return new NextRequest(
    'http://localhost/api/calendar/events?start=2026-07-01T00:00:00Z&end=2026-07-02T00:00:00Z',
  )
}
function postReq(): NextRequest {
  return new NextRequest('http://localhost/api/calendar/events', {
    method: 'POST',
    body: JSON.stringify({
      title: 'T',
      start: '2026-07-01T10:00:00Z',
      end: '2026-07-01T11:00:00Z',
    }),
  })
}

describe('/api/calendar/events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })
    mockLimit.mockResolvedValue({ success: true })
  })

  it('GET 403 calendar_not_connected when service throws CalendarNotConnectedError', async () => {
    mockGetEvents.mockRejectedValue(new CalendarNotConnectedError())
    const res = await GET(getReq())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'calendar_not_connected' })
  })
  it('GET 500 on other errors', async () => {
    mockGetEvents.mockRejectedValue(new Error('boom'))
    const res = await GET(getReq())
    expect(res.status).toBe(500)
  })
  it('GET 200 happy path', async () => {
    mockGetEvents.mockResolvedValue([])
    const res = await GET(getReq())
    expect(res.status).toBe(200)
  })
  it('POST 403 calendar_not_connected', async () => {
    mockCreateEvent.mockRejectedValue(new CalendarNotConnectedError())
    const res = await POST(postReq())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'calendar_not_connected' })
  })
  it('POST 201-shape happy path', async () => {
    mockCreateEvent.mockResolvedValue({ id: 'e1' })
    const res = await POST(postReq())
    expect(res.status).toBe(200)
  })
  it('401 unauthenticated', async () => {
    // mockResolvedValueOnce would only cover the first of the two auth() calls
    // below (GET then POST) and fall back to the authenticated default for the
    // second — use mockResolvedValue so both calls in this test see null.
    mockAuth.mockResolvedValue(null as never)
    expect((await GET(getReq())).status).toBe(401)
    expect((await POST(postReq())).status).toBe(401)
  })
})
