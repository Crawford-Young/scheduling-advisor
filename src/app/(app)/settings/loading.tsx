import { ViewTransition } from 'react'
import { Skeleton } from '@/lib/ui'

export default function SettingsLoading() {
  return (
    <ViewTransition exit="reveal-exit">
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </ViewTransition>
  )
}
