import * as React from 'react'
import { ViewTransition } from 'react'
import { Skeleton } from '@/lib/ui'

export default function ProfileLoading(): React.JSX.Element {
  return (
    <ViewTransition exit="reveal-exit">
      <div className="mx-auto max-w-5xl space-y-6" aria-busy="true">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </ViewTransition>
  )
}
