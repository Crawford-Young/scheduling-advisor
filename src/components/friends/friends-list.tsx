'use client'
import * as React from 'react'
import { MoreHorizontal } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
} from '@/lib/ui'
import { removeFriend } from '@/server/actions/friends'
import { FriendRow, friendDisplayName } from './friend-row'
import {
  FRIEND_ACTION_ERROR_MESSAGE as ERROR_MESSAGE,
  useFriendRequestAction,
} from './use-friend-action'
import type { FriendUser } from '@/server/queries/friends'

const NO_MATCHES = 'No matches.'
const NO_FRIENDS = 'No friends yet. Find people via search.'

interface FriendRowItemProps {
  readonly friend: FriendUser
}

function FriendRowItem({ friend }: FriendRowItemProps): React.JSX.Element {
  const { isPending, hasError, run } = useFriendRequestAction()

  function handleRemove(): void {
    run(() => removeFriend({ friendshipId: friend.friendshipId }))
  }

  return (
    <FriendRow user={friend}>
      <div className="flex flex-col items-end gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Options for ${friendDisplayName(friend)}`}
              disabled={isPending}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          {/* min-w-0 drops the library's min-w-[8rem]: with one short item the
              slack all lands on the right and reads as uncentered text. */}
          <DropdownMenuContent align="end" className="min-w-0">
            <DropdownMenuItem onSelect={handleRemove} disabled={isPending}>
              Remove friend
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {hasError && <p className="text-destructive text-sm">{ERROR_MESSAGE}</p>}
      </div>
    </FriendRow>
  )
}

interface FriendsListProps {
  readonly friends: readonly FriendUser[]
  readonly isFiltered: boolean
}

/** Renders the accepted-friends list for the /friends page's Friends tab. */
export function FriendsList({ friends, isFiltered }: FriendsListProps): React.JSX.Element {
  if (friends.length === 0) {
    return <EmptyState message={isFiltered ? NO_MATCHES : NO_FRIENDS} />
  }
  return (
    <div className="divide-border divide-y">
      {friends.map((friend) => (
        <FriendRowItem key={friend.friendshipId} friend={friend} />
      ))}
    </div>
  )
}
