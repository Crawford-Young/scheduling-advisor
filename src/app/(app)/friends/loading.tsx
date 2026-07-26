import * as React from 'react'
import { ViewTransition } from 'react'
import { Skeleton } from '@/lib/ui'

export default function FriendsLoading(): React.JSX.Element {
  return (
    <ViewTransition exit="reveal-exit">
      <div className="mx-auto max-w-5xl space-y-10" aria-busy="true">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </ViewTransition>
  )
}
