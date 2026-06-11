import { google } from 'googleapis'
import { db } from '@/db'
import { accounts } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { logger } from '@/lib/logger'
import type { CalendarService, FreeSlot } from '../interfaces/calendar'

async function getClient(userId: string) {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
  })
  if (!account?.access_token) throw new Error('No Google account linked for user')

  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  )
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token ?? undefined,
  })
  return google.calendar({ version: 'v3', auth: oauth2Client })
}

export const googleCalendarService: CalendarService = {
  async getEvents(userId, start, end) {
    const calendar = await getClient(userId)
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    })
    return (res.data.items ?? []).map((item) => ({
      id: item.id ?? '',
      title: item.summary ?? '(No title)',
      start: new Date(item.start?.dateTime ?? item.start?.date ?? ''),
      end: new Date(item.end?.dateTime ?? item.end?.date ?? ''),
      calendarId: 'primary',
    }))
  },

  async getFreeSlots(userId, start, end, minDurationMinutes) {
    const calendar = await getClient(userId)
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        items: [{ id: 'primary' }],
      },
    })

    const busy = res.data.calendars?.['primary']?.busy ?? []
    const slots: FreeSlot[] = []
    let cursor = new Date(start)

    for (const block of busy) {
      const blockStart = new Date(block.start ?? '')
      if (cursor < blockStart) {
        const durationMinutes = Math.floor((blockStart.getTime() - cursor.getTime()) / 60000)
        if (durationMinutes >= minDurationMinutes) {
          slots.push({ start: new Date(cursor), end: blockStart, durationMinutes })
        }
      }
      const blockEnd = new Date(block.end ?? '')
      if (blockEnd > cursor) cursor = blockEnd
    }

    if (cursor < end) {
      const durationMinutes = Math.floor((end.getTime() - cursor.getTime()) / 60000)
      if (durationMinutes >= minDurationMinutes) {
        slots.push({ start: new Date(cursor), end: new Date(end), durationMinutes })
      }
    }

    return slots
  },

  async createEvent(userId, event) {
    const calendar = await getClient(userId)
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.title,
        start: { dateTime: event.start.toISOString() },
        end: { dateTime: event.end.toISOString() },
      },
    })
    logger.info({ userId, eventId: res.data.id }, 'Calendar event created')
    return {
      id: res.data.id ?? '',
      title: res.data.summary ?? '',
      start: new Date(res.data.start?.dateTime ?? ''),
      end: new Date(res.data.end?.dateTime ?? ''),
      calendarId: 'primary',
    }
  },

  async deleteEvent(userId, eventId) {
    const calendar = await getClient(userId)
    await calendar.events.delete({ calendarId: 'primary', eventId })
    logger.info({ userId, eventId }, 'Calendar event deleted')
  },
}
