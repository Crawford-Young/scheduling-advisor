'use client'
import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/lib/ui'
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
} from '@/server/actions/friends'
import {
  FRIEND_ACTION_ERROR_MESSAGE,
  useFriendRequestAction,
} from '@/components/friends/use-friend-action'
import type { FriendshipView } from '@/lib/friendship-view'

export type { FriendshipView }

interface FriendButtonProps {
  readonly profileUserId: string
  readonly view: FriendshipView
  readonly friendshipId: string | null
}

export function FriendButton({
  profileUserId,
  view,
  friendshipId,
}: FriendButtonProps): React.JSX.Element {
  const { isPending, hasError, run } = useFriendRequestAction()

  function handleAdd(): void {
    run(() => sendFriendRequest({ addresseeId: profileUserId }))
  }

  function handleCancel(): void {
    if (friendshipId !== null) run(() => cancelFriendRequest({ friendshipId }))
  }

  function handleAccept(): void {
    if (friendshipId !== null) run(() => acceptFriendRequest({ friendshipId }))
  }

  function handleDecline(): void {
    if (friendshipId !== null) run(() => declineFriendRequest({ friendshipId }))
  }

  function handleRemove(): void {
    if (friendshipId !== null) run(() => removeFriend({ friendshipId }))
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {view === 'none' && (
          <Button type="button" onClick={handleAdd} disabled={isPending}>
            Add friend
          </Button>
        )}
        {view === 'outgoing' && (
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isPending}>
            Requested
          </Button>
        )}
        {view === 'incoming' && (
          <>
            <Button type="button" onClick={handleAccept} disabled={isPending}>
              Accept
            </Button>
            <Button type="button" variant="outline" onClick={handleDecline} disabled={isPending}>
              Decline
            </Button>
          </>
        )}
        {view === 'friends' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Friends
                {/* The label alone states the relationship and reads as an inert
                    status pill — the caret is what says actions live behind it. */}
                <ChevronDown className="h-4 w-4" />
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
        )}
      </div>
      {hasError && <p className="text-destructive text-sm">{FRIEND_ACTION_ERROR_MESSAGE}</p>}
    </div>
  )
}
