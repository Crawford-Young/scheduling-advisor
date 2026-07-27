'use client'
import * as React from 'react'
import { Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@/lib/ui'
import { FriendsList } from './friends-list'
import { IncomingRequestsList, OutgoingRequestsList } from './request-lists'
import type { FriendRequestEntry, FriendUser } from '@/server/queries/friends'

const SEARCH_PLACEHOLDER = 'Search by name or @username'

interface FriendsTabsProps {
  readonly friends: readonly FriendUser[]
  readonly incoming: readonly FriendRequestEntry[]
  readonly outgoing: readonly FriendRequestEntry[]
}

function matchesQuery(user: FriendUser, needle: string): boolean {
  if (needle === '') return true
  const name = user.name?.toLowerCase() ?? ''
  const username = user.username?.toLowerCase() ?? ''
  return name.includes(needle) || username.includes(needle)
}

export function FriendsTabs({ friends, incoming, outgoing }: FriendsTabsProps): React.JSX.Element {
  const [query, setQuery] = React.useState('')
  const needle = query.trim().toLowerCase()
  const isFiltered = needle !== ''

  return (
    <Tabs defaultValue="friends" className="space-y-4">
      <TabsList>
        <TabsTrigger value="friends">
          Friends
          <span className="text-muted-foreground ml-1.5 text-xs">{friends.length}</span>
        </TabsTrigger>
        <TabsTrigger value="requests">
          Requests
          <span className="text-muted-foreground ml-1.5 text-xs">{incoming.length}</span>
        </TabsTrigger>
        <TabsTrigger value="sent">
          Sent
          <span className="text-muted-foreground ml-1.5 text-xs">{outgoing.length}</span>
        </TabsTrigger>
      </TabsList>
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={SEARCH_PLACEHOLDER}
        aria-label="Search friends"
      />
      <TabsContent value="friends">
        <FriendsList
          friends={friends.filter((f) => matchesQuery(f, needle))}
          isFiltered={isFiltered}
        />
      </TabsContent>
      <TabsContent value="requests">
        <IncomingRequestsList
          requests={incoming.filter((r) => matchesQuery(r, needle))}
          isFiltered={isFiltered}
        />
      </TabsContent>
      <TabsContent value="sent">
        <OutgoingRequestsList
          requests={outgoing.filter((r) => matchesQuery(r, needle))}
          isFiltered={isFiltered}
        />
      </TabsContent>
    </Tabs>
  )
}
