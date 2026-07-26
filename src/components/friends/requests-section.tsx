'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button, EmptyState } from '@/lib/ui'
import {
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
} from '@/server/actions/friends'
import { FriendRow } from './friend-row'
import type { FriendRequestEntry } from '@/server/queries/friends'

type FriendActionResult = { data: unknown } | { error: unknown }

const ERROR_MESSAGE = 'Something went wrong. Try again.'

/**
 * Runs a friend action inside a transition, refreshing the route on success
 * (wrapped in a nested `startTransition` so `router.refresh()` survives the
 * `experimental.viewTransition` abort trap) and surfacing an inline error on
 * failure — mirrors `FriendButton`'s pattern.
 */
function useFriendRequestAction(): {
  readonly isPending: boolean
  readonly hasError: boolean
  readonly run: (action: () => Promise<FriendActionResult>) => void
} {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()
  const [hasError, setHasError] = React.useState(false)

  function run(action: () => Promise<FriendActionResult>): void {
    setHasError(false)
    startTransition(async () => {
      const result = await action()
      if ('error' in result) {
        setHasError(true)
        return
      }
      React.startTransition(() => router.refresh())
    })
  }

  return { isPending, hasError, run }
}

interface IncomingRequestRowProps {
  readonly request: FriendRequestEntry
}

function IncomingRequestRow({ request }: IncomingRequestRowProps): React.JSX.Element {
  const { isPending, hasError, run } = useFriendRequestAction()

  function handleAccept(): void {
    run(() => acceptFriendRequest({ friendshipId: request.friendshipId }))
  }

  function handleDecline(): void {
    run(() => declineFriendRequest({ friendshipId: request.friendshipId }))
  }

  return (
    <FriendRow user={request}>
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-2">
          <Button type="button" onClick={handleAccept} disabled={isPending}>
            Accept
          </Button>
          <Button type="button" variant="outline" onClick={handleDecline} disabled={isPending}>
            Decline
          </Button>
        </div>
        {hasError && <p className="text-destructive text-sm">{ERROR_MESSAGE}</p>}
      </div>
    </FriendRow>
  )
}

interface OutgoingRequestRowProps {
  readonly request: FriendRequestEntry
}

function OutgoingRequestRow({ request }: OutgoingRequestRowProps): React.JSX.Element {
  const { isPending, hasError, run } = useFriendRequestAction()

  function handleCancel(): void {
    run(() => cancelFriendRequest({ friendshipId: request.friendshipId }))
  }

  return (
    <FriendRow user={request}>
      <div className="flex flex-col items-end gap-1">
        <Button type="button" variant="outline" onClick={handleCancel} disabled={isPending}>
          Cancel
        </Button>
        {hasError && <p className="text-destructive text-sm">{ERROR_MESSAGE}</p>}
      </div>
    </FriendRow>
  )
}

interface RequestsSectionProps {
  readonly incoming: readonly FriendRequestEntry[]
  readonly outgoing: readonly FriendRequestEntry[]
}

/** Renders the incoming and sent friend-request sections of the /friends page. */
export function RequestsSection({ incoming, outgoing }: RequestsSectionProps): React.JSX.Element {
  return (
    <>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Incoming requests</h2>
        {incoming.length === 0 ? (
          <EmptyState message="No incoming requests." />
        ) : (
          <div className="space-y-2">
            {incoming.map((request) => (
              <IncomingRequestRow key={request.friendshipId} request={request} />
            ))}
          </div>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Sent requests</h2>
        {outgoing.length === 0 ? (
          <EmptyState message="No sent requests." />
        ) : (
          <div className="space-y-2">
            {outgoing.map((request) => (
              <OutgoingRequestRow key={request.friendshipId} request={request} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
