import * as React from 'react'
import { ViewTransition } from 'react'
import { Skeleton } from '@/lib/ui'

export default function FriendsLoading(): React.JSX.Element {
  return (
    <ViewTransition exit="reveal-exit">
      <div className="mx-auto max-w-5xl space-y-6" aria-busy="true">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>
    </ViewTransition>
  )
}
