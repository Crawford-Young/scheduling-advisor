import * as React from 'react'
import { Flame } from 'lucide-react'
import { Badge } from '@/lib/ui'

interface StreakBadgeProps {
  readonly streak: number
}

export function StreakBadge({ streak }: StreakBadgeProps): React.JSX.Element | null {
  if (streak === 0) return null
  return (
    <Badge variant="outline" className="flex items-center gap-1 text-xs">
      <Flame className="h-3 w-3 text-orange-500" aria-hidden />
      <span>{streak}</span>
    </Badge>
  )
}
