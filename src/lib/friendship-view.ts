import type { FriendRequestEntry, FriendUser } from '@/server/queries/friends'

/** The viewer's relationship to another user, as a UI affordance state. */
export type FriendshipView = 'none' | 'outgoing' | 'incoming' | 'friends'

/**
 * Collapses the /friends page's three lists into one userId → relationship
 * lookup. The one-row-per-pair DB invariant guarantees a user appears in at
 * most one list, so insertion order carries no precedence semantics.
 */
export function buildRelationMap(
  friends: readonly FriendUser[],
  incoming: readonly FriendRequestEntry[],
  outgoing: readonly FriendRequestEntry[],
): ReadonlyMap<string, FriendshipView> {
  const relations = new Map<string, FriendshipView>()
  for (const friend of friends) relations.set(friend.userId, 'friends')
  for (const request of incoming) relations.set(request.userId, 'incoming')
  for (const request of outgoing) relations.set(request.userId, 'outgoing')
  return relations
}
