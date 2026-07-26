import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { accounts } from '@/db/schema'
import { hasCalendarScopes } from '@/lib/google-calendar-scopes'

export type CalendarConnectionStatus = 'connected' | 'not_connected'

export async function getCalendarConnection(userId: string): Promise<CalendarConnectionStatus> {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
  })
  if (account?.refresh_token && hasCalendarScopes(account.scope)) return 'connected'
  return 'not_connected'
}
