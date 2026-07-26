'use server'

import { and, eq } from 'drizzle-orm'
import { auth, signIn } from '@/auth'
import { db } from '@/db'
import { accounts } from '@/db/schema'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { decryptToken } from '@/lib/token-crypto'
import { CALENDAR_CONNECT_SCOPE, stripCalendarScopes } from '@/lib/google-calendar-scopes'

const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

function safeRedirect(redirectTo: string): string {
  return redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/'
}

export async function connectGoogleCalendar(redirectTo: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const { success } = await ratelimit.limit(session.user.id)
  if (!success) throw new Error('Too many requests')

  await signIn(
    'google',
    { redirectTo: safeRedirect(redirectTo) },
    {
      scope: CALENDAR_CONNECT_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    },
  )
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const { success } = await ratelimit.limit(session.user.id)
  if (!success) throw new Error('Too many requests')

  const userId = session.user.id
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
  })

  if (account?.refresh_token) {
    try {
      // Token travels in the POST body — request URLs are not secret-safe.
      await fetch(GOOGLE_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: decryptToken(account.refresh_token) }),
      })
    } catch (err) {
      logger.error({ err, userId }, 'Google token revoke failed; clearing local tokens anyway')
    }
  }

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
