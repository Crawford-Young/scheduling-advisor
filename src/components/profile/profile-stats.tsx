import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/lib/ui'
import type { ProfileStats as ProfileStatsData } from '@/server/queries/profile'

interface StatCard {
  readonly label: string
  readonly key: keyof ProfileStatsData
}

const STAT_CARDS: readonly StatCard[] = [
  { label: 'This week', key: 'completionsThisWeek' },
  { label: 'This month', key: 'completionsThisMonth' },
  { label: 'All time', key: 'completionsAllTime' },
]

interface ProfileStatsProps {
  readonly stats: ProfileStatsData
}

export function ProfileStats({ stats }: ProfileStatsProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {STAT_CARDS.map(({ label, key }) => (
        <Card key={key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats[key]}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
