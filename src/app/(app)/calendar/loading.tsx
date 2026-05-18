import { Skeleton } from '@crawfordyoung/ui'

export default function CalendarLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-[600px] rounded-lg" />
    </div>
  )
}
