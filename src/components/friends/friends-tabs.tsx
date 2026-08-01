'use client'
import * as React from 'react'
import { UserPlus } from 'lucide-react'
import { Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@/lib/ui'
import { AddFriendDialog, SEARCH_PLACEHOLDER } from './add-friend-dialog'
import { FriendsList } from './friends-list'
import { IncomingRequestsList, OutgoingRequestsList } from './request-lists'
import { buildRelationMap } from '@/lib/friendship-view'
import type { FriendRequestEntry, FriendUser } from '@/server/queries/friends'

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
  const [addOpen, setAddOpen] = React.useState(false)
  const needle = query.trim().toLowerCase()
  const isFiltered = needle !== ''
  const relations = React.useMemo(
    () => buildRelationMap(friends, incoming, outgoing),
    [friends, incoming, outgoing],
  )

  return (
    <Tabs defaultValue="friends" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
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
        <Button type="button" onClick={() => setAddOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Add friend
        </Button>
      </div>
      {/* Conditional mount per the repo's close→reopen-freshness idiom — a
          persistently rendered dialog would serve the abandoned search on reopen. */}
      {addOpen && <AddFriendDialog open onOpenChange={setAddOpen} relations={relations} />}
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
