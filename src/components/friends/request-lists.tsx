'use client'
import * as React from 'react'
import { Button, EmptyState } from '@/lib/ui'
import {
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
} from '@/server/actions/friends'
import { FriendRow } from './friend-row'
import {
  FRIEND_ACTION_ERROR_MESSAGE as ERROR_MESSAGE,
  useFriendRequestAction,
} from './use-friend-action'
import type { FriendRequestEntry } from '@/server/queries/friends'

const NO_MATCHES = 'No matches.'

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

interface RequestListProps {
  readonly requests: readonly FriendRequestEntry[]
  readonly isFiltered: boolean
}

export function IncomingRequestsList({
  requests,
  isFiltered,
}: RequestListProps): React.JSX.Element {
  if (requests.length === 0) {
    return <EmptyState message={isFiltered ? NO_MATCHES : 'No incoming requests.'} />
  }
  return (
    <div className="divide-border divide-y">
      {requests.map((request) => (
        <IncomingRequestRow key={request.friendshipId} request={request} />
      ))}
    </div>
  )
}

export function OutgoingRequestsList({
  requests,
  isFiltered,
}: RequestListProps): React.JSX.Element {
  if (requests.length === 0) {
    return <EmptyState message={isFiltered ? NO_MATCHES : 'No sent requests.'} />
  }
  return (
    <div className="divide-border divide-y">
      {requests.map((request) => (
        <OutgoingRequestRow key={request.friendshipId} request={request} />
      ))}
    </div>
  )
}
