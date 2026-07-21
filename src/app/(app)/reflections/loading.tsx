import { ViewTransition } from 'react'
import { Skeleton } from '@/lib/ui'

export default function ReflectionsLoading() {
  return (
    <ViewTransition exit="reveal-exit">
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    </ViewTransition>
  )
}
