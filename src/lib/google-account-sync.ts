import { and, eq } from 'drizzle-orm'
import type { Account } from 'next-auth'
import { db } from '@/db'
import { accounts } from '@/db/schema'
import { encryptToken } from '@/lib/token-crypto'
import { mergeScopes } from '@/lib/google-calendar-scopes'

export function encryptAccountTokenFields<
  T extends { access_token?: string | null; refresh_token?: string | null },
>(fields: T): T {
  return {
    ...fields,
    ...(fields.access_token ? { access_token: encryptToken(fields.access_token) } : {}),
    ...(fields.refresh_token ? { refresh_token: encryptToken(fields.refresh_token) } : {}),
  }
}

export async function syncGoogleAccount(account: Account): Promise<void> {
  const existing = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.provider, account.provider),
      eq(accounts.providerAccountId, account.providerAccountId),
    ),
  })
  if (!existing) return

  const updates: Partial<typeof accounts.$inferInsert> = {
    scope: mergeScopes(existing.scope, account.scope),
  }
  if (account.access_token) updates.access_token = encryptToken(account.access_token)
  if (account.refresh_token) updates.refresh_token = encryptToken(account.refresh_token)
  if (account.expires_at) updates.expires_at = account.expires_at

  await db
    .update(accounts)
    .set(updates)
    .where(
      and(
        eq(accounts.provider, account.provider),
        eq(accounts.providerAccountId, account.providerAccountId),
      ),
    )
}
