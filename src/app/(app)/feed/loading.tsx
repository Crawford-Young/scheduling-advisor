import * as React from 'react'
import { ViewTransition } from 'react'
import { Skeleton } from '@/lib/ui'

export default function FeedLoading(): React.JSX.Element {
  return (
    <ViewTransition exit="reveal-exit">
      <div className="mx-auto max-w-5xl space-y-6" aria-busy="true">
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    </ViewTransition>
  )
}
