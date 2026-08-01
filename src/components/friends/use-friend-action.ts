'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'

export type FriendActionResult = { data: unknown } | { error: unknown }

export const FRIEND_ACTION_ERROR_MESSAGE = 'Something went wrong. Try again.'

/**
 * Runs a friend action inside a transition, refreshing the route on success
 * (wrapped in a nested `startTransition` so `router.refresh()` survives the
 * `experimental.viewTransition` abort trap) and surfacing an inline error on
 * failure. The single home for this sequence — FriendButton, both /friends
 * lists, and the add-friend dialog all consume it.
 */
export function useFriendRequestAction(): {
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
