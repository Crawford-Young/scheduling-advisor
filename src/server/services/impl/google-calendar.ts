import { google } from 'googleapis'
import { db } from '@/db'
import { accounts } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { logger } from '@/lib/logger'
import { decryptToken, encryptToken } from '@/lib/token-crypto'
import { hasCalendarScopes, stripCalendarScopes } from '@/lib/google-calendar-scopes'
import { CalendarNotConnectedError } from '../errors'
import type { CalendarService, FreeSlot } from '../interfaces/calendar'

const MS_PER_SECOND = 1000

function isInvalidGrantError(err: unknown): boolean {
  const e = err as { response?: { data?: { error?: string } }; message?: string }
  return (
    e?.response?.data?.error === 'invalid_grant' || (e?.message?.includes('invalid_grant') ?? false)
  )
}

async function clearCalendarConnection(userId: string): Promise<void> {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
  })
  await db
    .update(accounts)
    .set({
      access_token: null,
      refresh_token: null,
      expires_at: null,
      scope: stripCalendarScopes(account?.scope ?? null),
    })
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'google')))
}

async function persistRefreshedTokens(
  userId: string,
  tokens: { access_token?: string | null; expiry_date?: number | null },
): Promise<void> {
  const updates: { access_token?: string; expires_at?: number } = {}
  if (tokens.access_token) updates.access_token = encryptToken(tokens.access_token)
  if (tokens.expiry_date) updates.expires_at = Math.floor(tokens.expiry_date / MS_PER_SECOND)
  if (Object.keys(updates).length === 0) return
  await db
    .update(accounts)
    .set(updates)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'google')))
}

async function getClient(userId: string) {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
  })
  if (!account?.access_token || !hasCalendarScopes(account.scope)) {
    throw new CalendarNotConnectedError()
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  )
  oauth2Client.setCredentials({
    access_token: decryptToken(account.access_token),
    refresh_token: account.refresh_token ? decryptToken(account.refresh_token) : undefined,
    expiry_date: account.expires_at ? account.expires_at * MS_PER_SECOND : undefined,
  })
  oauth2Client.on('tokens', (tokens) => {
    void persistRefreshedTokens(userId, tokens).catch((err: unknown) =>
      logger.error({ err, userId }, 'Failed to persist refreshed Google tokens'),
    )
  })
  return google.calendar({ version: 'v3', auth: oauth2Client })
}

async function callCalendar<T>(
  userId: string,
  fn: (calendar: Awaited<ReturnType<typeof getClient>>) => Promise<T>,
): Promise<T> {
  const calendar = await getClient(userId)
  try {
    return await fn(calendar)
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await clearCalendarConnection(userId)
      throw new CalendarNotConnectedError()
    }
    throw err
  }
}

export const googleCalendarService: CalendarService = {
  async getEvents(userId, start, end) {
    return callCalendar(userId, async (calendar) => {
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
    })
  },

  async getFreeSlots(userId, start, end, minDurationMinutes) {
    return callCalendar(userId, async (calendar) => {
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
    })
  },

  async createEvent(userId, event) {
    return callCalendar(userId, async (calendar) => {
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
    })
  },

  async deleteEvent(userId, eventId) {
    return callCalendar(userId, async (calendar) => {
      await calendar.events.delete({ calendarId: 'primary', eventId })
      logger.info({ userId, eventId }, 'Calendar event deleted')
    })
  },
}
