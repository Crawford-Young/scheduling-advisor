import { describe, expect, it } from 'vitest'
import { buildRelationMap } from './friendship-view'
import type { FriendRequestEntry, FriendUser } from '@/server/queries/friends'

function makeUser(userId: string): FriendUser {
  return { friendshipId: `f-${userId}`, userId, username: userId, name: null, image: null }
}

function makeRequest(userId: string): FriendRequestEntry {
  return { ...makeUser(userId), createdAt: new Date('2026-01-01T00:00:00.000Z') }
}

describe('buildRelationMap', () => {
  it('maps each list to its relationship state', () => {
    const relations = buildRelationMap(
      [makeUser('u-friend')],
      [makeRequest('u-in')],
      [makeRequest('u-out')],
    )

    expect(relations.get('u-friend')).toBe('friends')
    expect(relations.get('u-in')).toBe('incoming')
    expect(relations.get('u-out')).toBe('outgoing')
    expect(relations.has('u-stranger')).toBe(false)
  })

  it('returns an empty map for empty lists', () => {
    expect(buildRelationMap([], [], []).size).toBe(0)
  })
})
