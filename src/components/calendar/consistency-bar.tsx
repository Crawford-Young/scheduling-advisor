import * as React from 'react'

interface ConsistencyBarProps {
  readonly plannedCount: number
  readonly completedCount: number
  readonly consistencyPct: number
}

export function ConsistencyBar({
  plannedCount,
  completedCount,
  consistencyPct,
}: ConsistencyBarProps): React.JSX.Element {
  const isPerfect = plannedCount > 0 && completedCount === plannedCount

  return (
    <div className="border-border bg-card flex items-center gap-3 rounded-lg border px-4 py-2">
      <div className="flex-1">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {completedCount}/{plannedCount} days
          </span>
          <span className={isPerfect ? 'font-semibold text-emerald-400' : 'text-foreground'}>
            {isPerfect ? 'Perfect week 🔥' : `${consistencyPct}% this week`}
          </span>
        </div>
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${consistencyPct}%` }}
            role="progressbar"
            aria-valuenow={consistencyPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${consistencyPct}% weekly consistency`}
          />
        </div>
      </div>
    </div>
  )
}
