import { Card, CardContent, Progress } from '@/lib/ui'

interface ConsistencyBarProps {
  readonly plannedCount: number
  readonly completedCount: number
  readonly consistencyPct: number
}

export function ConsistencyBar({
  plannedCount,
  completedCount,
  consistencyPct,
}: ConsistencyBarProps) {
  const isPerfect = plannedCount > 0 && completedCount === plannedCount

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-2">
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {completedCount}/{plannedCount} days
            </span>
            <span className={isPerfect ? 'font-semibold text-emerald-400' : 'text-foreground'}>
              {isPerfect ? 'Perfect week 🔥' : `${consistencyPct}% this week`}
            </span>
          </div>
          <Progress
            value={consistencyPct}
            aria-label={`${consistencyPct}% weekly consistency`}
            className="h-1.5 [&>div]:bg-emerald-500"
          />
        </div>
      </CardContent>
    </Card>
  )
}
