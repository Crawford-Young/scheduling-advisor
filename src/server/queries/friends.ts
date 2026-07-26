import { db } from '@/db'
import { friendships, users } from '@/db/schema'
import { and, eq, or } from 'drizzle-orm'

const SINGLE_ROW_LIMIT = 1

export type FriendshipRow = typeof friendships.$inferSelect

/**
 * The pair's friendship row regardless of who requested — at most one exists
 * (expression unique index on least/greatest of the pair).
 */
export async function getFriendshipBetween(
  userIdA: string,
  userIdB: string,
): Promise<FriendshipRow | null> {
  const rows = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, userIdA), eq(friendships.addresseeId, userIdB)),
        and(eq(friendships.requesterId, userIdB), eq(friendships.addresseeId, userIdA)),
      ),
    )
    .limit(SINGLE_ROW_LIMIT)
  return rows[0] ?? null
}

export interface FriendUser {
  readonly friendshipId: string
  readonly userId: string
  readonly username: string | null
  readonly name: string | null
  readonly image: string | null
}

export interface FriendRequestEntry extends FriendUser {
  readonly createdAt: Date
}

export async function getFriends(userId: string): Promise<readonly FriendUser[]> {
  const rows = await db
    .select({
      friendshipId: friendships.id,
      userId: users.id,
      username: users.username,
      name: users.name,
      image: users.image,
    })
    .from(friendships)
    .innerJoin(
      users,
      or(
        and(eq(friendships.requesterId, userId), eq(users.id, friendships.addresseeId)),
        and(eq(friendships.addresseeId, userId), eq(users.id, friendships.requesterId)),
      ),
    )
    .where(
      and(
        eq(friendships.status, 'accepted'),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
      ),
    )
  return rows
}

export async function getIncomingRequests(userId: string): Promise<readonly FriendRequestEntry[]> {
  const rows = await db
    .select({
      friendshipId: friendships.id,
      userId: users.id,
      username: users.username,
      name: users.name,
      image: users.image,
      createdAt: friendships.createdAt,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.requesterId))
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, 'pending')))
  return rows
}

export async function getOutgoingRequests(userId: string): Promise<readonly FriendRequestEntry[]> {
  const rows = await db
    .select({
      friendshipId: friendships.id,
      userId: users.id,
      username: users.username,
      name: users.name,
      image: users.image,
      createdAt: friendships.createdAt,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.addresseeId))
    .where(and(eq(friendships.requesterId, userId), eq(friendships.status, 'pending')))
  return rows
}
