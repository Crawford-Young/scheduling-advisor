'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button, EmptyState } from '@/lib/ui'
import { removeFriend } from '@/server/actions/friends'
import { FriendRow } from './friend-row'
import type { FriendUser } from '@/server/queries/friends'

type FriendActionResult = { data: unknown } | { error: unknown }

const ERROR_MESSAGE = 'Something went wrong. Try again.'

interface FriendRowItemProps {
  readonly friend: FriendUser
}

function FriendRowItem({ friend }: FriendRowItemProps): React.JSX.Element {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()
  const [hasError, setHasError] = React.useState(false)

  function handleRemove(): void {
    setHasError(false)
    startTransition(async () => {
      const result: FriendActionResult = await removeFriend({ friendshipId: friend.friendshipId })
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

  return (
    <FriendRow user={friend}>
      <div className="flex flex-col items-end gap-1">
        <Button type="button" variant="outline" onClick={handleRemove} disabled={isPending}>
          Remove friend
        </Button>
        {hasError && <p className="text-destructive text-sm">{ERROR_MESSAGE}</p>}
      </div>
    </FriendRow>
  )
}

interface FriendsSectionProps {
  readonly friends: readonly FriendUser[]
}

/** Renders the accepted-friends section of the /friends page. */
export function FriendsSection({ friends }: FriendsSectionProps): React.JSX.Element {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Friends</h2>
      {friends.length === 0 ? (
        <EmptyState message="No friends yet. Find people via search." />
      ) : (
        <div className="space-y-2">
          {friends.map((friend) => (
            <FriendRowItem key={friend.friendshipId} friend={friend} />
          ))}
        </div>
      )}
    </section>
  )
}
