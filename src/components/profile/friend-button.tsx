'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
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

export type FriendshipView = 'none' | 'outgoing' | 'incoming' | 'friends'

interface FriendButtonProps {
  readonly profileUserId: string
  readonly view: FriendshipView
  readonly friendshipId: string | null
}

type FriendActionResult = { data: unknown } | { error: unknown }

const ERROR_MESSAGE = 'Something went wrong. Try again.'

export function FriendButton({
  profileUserId,
  view,
  friendshipId,
}: FriendButtonProps): React.JSX.Element {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()
  const [hasError, setHasError] = React.useState(false)

  function runAction(action: () => Promise<FriendActionResult>): void {
    setHasError(false)
    startTransition(async () => {
      const result = await action()
      if ('error' in result) {
        setHasError(true)
        return
      }
      // router.refresh() under experimental.viewTransition must run inside a
      // React transition or the browser aborts it (InvalidStateError) — see
      // the repo's programmatic-nav-under-viewTransition trap.
      React.startTransition(() => router.refresh())
    })
  }

  function handleAdd(): void {
    runAction(() => sendFriendRequest({ addresseeId: profileUserId }))
  }

  function handleCancel(): void {
    if (friendshipId !== null) runAction(() => cancelFriendRequest({ friendshipId }))
  }

  function handleAccept(): void {
    if (friendshipId !== null) runAction(() => acceptFriendRequest({ friendshipId }))
  }

  function handleDecline(): void {
    if (friendshipId !== null) runAction(() => declineFriendRequest({ friendshipId }))
  }

  function handleRemove(): void {
    if (friendshipId !== null) runAction(() => removeFriend({ friendshipId }))
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
      {hasError && <p className="text-destructive text-sm">{ERROR_MESSAGE}</p>}
    </div>
  )
}
