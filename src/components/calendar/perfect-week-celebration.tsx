'use client'
import * as React from 'react'
import { Button } from '@/lib/ui'

interface PerfectWeekCelebrationProps {
  readonly visible: boolean
  readonly onDismiss: () => void
}

export function PerfectWeekCelebration({
  visible,
  onDismiss,
}: PerfectWeekCelebrationProps): React.JSX.Element | null {
  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Perfect week celebration"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="bg-card mx-4 max-w-sm space-y-4 rounded-2xl border border-emerald-500/30 p-8 text-center shadow-2xl">
        <div className="text-5xl" aria-hidden>
          🔥
        </div>
        <h2 className="text-foreground text-2xl font-bold">Perfect Week</h2>
        <p className="text-muted-foreground text-sm">
          You completed every planned event this week. Your rein is holding.
        </p>
        <Button onClick={onDismiss} aria-label="Dismiss celebration">
          Keep going
        </Button>
      </div>
    </div>
  )
}
