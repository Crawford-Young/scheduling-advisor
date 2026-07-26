import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCalendarService } from '@/server/services'
import { CalendarNotConnectedError } from '@/server/services/errors'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const createEventBody = z.object({
  title: z.string().min(1).max(200),
  start: z.string().datetime(),
  end: z.string().datetime(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { searchParams } = req.nextUrl
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end required' }, { status: 400 })
  }

  try {
    const service = await getCalendarService()
    const events = await service.getEvents(session.user.id, new Date(start), new Date(end))
    return NextResponse.json({ events })
  } catch (err) {
    if (err instanceof CalendarNotConnectedError) {
      return NextResponse.json({ error: 'calendar_not_connected' }, { status: 403 })
    }
    logger.error({ err, userId: session.user.id }, 'Failed to fetch calendar events')
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body: unknown = await req.json()
  const parsed = createEventBody.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const service = await getCalendarService()
    const event = await service.createEvent(session.user.id, {
      title: parsed.data.title,
      start: new Date(parsed.data.start),
      end: new Date(parsed.data.end),
    })
    return NextResponse.json({ event })
  } catch (err) {
    if (err instanceof CalendarNotConnectedError) {
      return NextResponse.json({ error: 'calendar_not_connected' }, { status: 403 })
    }
    logger.error({ err, userId: session.user.id }, 'Failed to create calendar event')
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
  }
}
