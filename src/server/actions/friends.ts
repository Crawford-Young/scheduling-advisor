'use server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db'
import { friendships } from '@/db/schema'
import { and, eq, or } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { sendFriendRequestSchema, friendshipTargetSchema } from '@/lib/schemas/friends'
import { getFriendshipBetween, type FriendshipRow } from '@/server/queries/friends'

type FriendActionResult = { data: FriendshipRow } | { error: unknown }
type FriendDeleteResult = { data: { success: boolean } } | { error: unknown }

const FRIENDS_PATH = '/friends'

// THREAT MODEL: every export here is a client-callable POST endpoint.
// Identity ALWAYS derives from auth() inside the function — the only
// client-supplied ids are the addressee (send) and the friendship row id,
// and every mutation's SQL predicate re-binds the caller's session id.

export async function sendFriendRequest(input: unknown): Promise<FriendActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }
  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Rate limited' }

  const parsed = sendFriendRequestSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }
  const userId = session.user.id
  const { addresseeId } = parsed.data

  if (addresseeId === userId) return { error: 'Cannot friend yourself' }

  const existing = await getFriendshipBetween(userId, addresseeId)
  if (existing !== null) return { error: 'A request or friendship already exists' }

  try {
    const [row] = await db
      .insert(friendships)
      .values({ requesterId: userId, addresseeId })
      .returning()
    revalidatePath(FRIENDS_PATH)
    return { data: row as FriendshipRow }
  } catch (error) {
    logger.error({ error }, 'sendFriendRequest failed')
    return { error: 'Failed to send friend request' }
  }
}

export async function acceptFriendRequest(input: unknown): Promise<FriendActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }
  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Rate limited' }

  const parsed = friendshipTargetSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const [row] = await db
    .update(friendships)
    .set({ status: 'accepted', respondedAt: new Date() })
    .where(
      and(
        eq(friendships.id, parsed.data.friendshipId),
        eq(friendships.addresseeId, session.user.id),
        eq(friendships.status, 'pending'),
      ),
    )
    .returning()
  if (row === undefined) return { error: 'Request not found' }
  revalidatePath(FRIENDS_PATH)
  return { data: row }
}

export async function declineFriendRequest(input: unknown): Promise<FriendDeleteResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }
  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Rate limited' }

  const parsed = friendshipTargetSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const [row] = await db
    .delete(friendships)
    .where(
      and(
        eq(friendships.id, parsed.data.friendshipId),
        eq(friendships.addresseeId, session.user.id),
        eq(friendships.status, 'pending'),
      ),
    )
    .returning()
  if (row === undefined) return { error: 'Request not found' }
  revalidatePath(FRIENDS_PATH)
  return { data: { success: true } }
}

export async function cancelFriendRequest(input: unknown): Promise<FriendDeleteResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }
  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Rate limited' }

  const parsed = friendshipTargetSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const [row] = await db
    .delete(friendships)
    .where(
      and(
        eq(friendships.id, parsed.data.friendshipId),
        eq(friendships.requesterId, session.user.id),
        eq(friendships.status, 'pending'),
      ),
    )
    .returning()
  if (row === undefined) return { error: 'Request not found' }
  revalidatePath(FRIENDS_PATH)
  return { data: { success: true } }
}

export async function removeFriend(input: unknown): Promise<FriendDeleteResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }
  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Rate limited' }

  const parsed = friendshipTargetSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const [row] = await db
    .delete(friendships)
    .where(
      and(
        eq(friendships.id, parsed.data.friendshipId),
        eq(friendships.status, 'accepted'),
        or(
          eq(friendships.requesterId, session.user.id),
          eq(friendships.addresseeId, session.user.id),
        ),
      ),
    )
    .returning()
  if (row === undefined) return { error: 'Friendship not found' }
  revalidatePath(FRIENDS_PATH)
  return { data: { success: true } }
}
