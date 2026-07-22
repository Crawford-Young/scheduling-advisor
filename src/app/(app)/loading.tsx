import { ViewTransition } from 'react'
import { Skeleton } from '@/lib/ui'

export default function HomeLoading() {
  return (
    <ViewTransition exit="reveal-exit">
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="flex gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-full" />
          ))}
        </div>
      </div>
    </ViewTransition>
  )
}
