'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { isUniqueViolation } from '@/lib/db-errors'
import { logger } from '@/lib/logger'
import { ratelimit } from '@/lib/redis'
import { isReservedUsername, usernameSchema } from '@/lib/schemas/username'
import { updateProfileSchema, type UpdateProfileInput } from '@/lib/schemas/profile'
import { isRenameBlocked } from '@/lib/username-rename'
import { revalidatePath } from 'next/cache'

// Module-private: a 'use server' file may export ONLY async functions, so this
// type stays here rather than being exported — mirrors ActivityActionResult,
// src/server/actions/activities.ts:13.
type SetUsernameResult = { data: { username: string } } | { error: unknown }

export async function setUsername(raw: string): Promise<SetUsernameResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = usernameSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const username = parsed.data
  const userId = session.user.id

  const [current] = await db
    .select({ username: users.username, lastUsernameChangeAt: users.lastUsernameChangeAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!current) return { error: 'Unauthorized' }

  // No-op guard: the Save button is already disabled when unchanged, but this
  // is a client-callable POST endpoint — a direct call must not burn a
  // rename-limit slot or re-stamp the column for a no-op.
  if (current.username === username) return { data: { username } }

  // Reserved and taken deliberately share this copy: distinct wording would
  // turn the blocklist into an enumerable oracle for near-zero user benefit.
  if (isReservedUsername(username)) return { error: 'Username unavailable' }

  const now = new Date()
  const blocked = isRenameBlocked({
    currentUsername: current.username,
    lastChangeAt: current.lastUsernameChangeAt,
    now,
  })
  if (blocked) return { error: 'Rename limit reached' }

  // Pre-check: fast rejection for the common "that name is obviously taken"
  // case. The UPDATE below is the real source of truth — neon-http has no
  // transactions, so this read-then-write is racy by construction.
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), ne(users.id, userId)))
    .limit(1)

  if (taken) return { error: 'Username unavailable' }

  try {
    // STAMP SEAM (pending user decision, username-w1 T4): the STRICT rule
    // stamps on EVERY successful write, first-ever set included. The
    // one-change-grace variant writes `current.username === null ? null : now`
    // here instead — that is the whole change on this side.
    await db.update(users).set({ username, lastUsernameChangeAt: now }).where(eq(users.id, userId))
  } catch (error) {
    // Race backstop: two concurrent callers can both clear the pre-check; the
    // unique index rejects the loser. Map that to the same generic copy — a raw
    // Postgres exception must never reach the client. Anything else re-throws.
    if (isUniqueViolation(error)) return { error: 'Username unavailable' }
    throw error
  }

  revalidatePath('/settings')
  revalidatePath(`/u/${username}`)
  // Only on an actual rename — the freed path must stop serving cached profile
  // data. `/u/<old-name>` then 404s via getProfileByUsername returning null
  // (src/app/(app)/u/[username]/page.tsx:31-32), which needs no extra code.
  if (current.username !== null) revalidatePath(`/u/${current.username}`)

  logger.info({ userId, username }, 'Username set')
  return { data: { username } }
}

export async function updateProfile(raw: UpdateProfileInput): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const { name, bio } = updateProfileSchema.parse(raw)
  await db.update(users).set({ name, bio }).where(eq(users.id, session.user.id))
  revalidatePath('/settings')
}
