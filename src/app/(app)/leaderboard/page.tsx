import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getLeaderboard, getPersonalHistory, getUserStats } from '@/server/queries/points'
import { PageHeader, LeaderboardTable, ScoreHistory, XpBar } from '@crawfordyoung/ui'

const LEVEL_MAX_XP: Record<string, number> = {
  seedling: 500,
  growing: 2000,
  thriving: 5000,
  flourishing: 10000,
  evergreen: 10000,
}

export default async function LeaderboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [global, history, stats] = await Promise.all([
    getLeaderboard('week'),
    getPersonalHistory(session.user.id),
    getUserStats(session.user.id),
  ])

  const levelName = stats?.currentLevel ?? 'seedling'
  const maxXp = LEVEL_MAX_XP[levelName] ?? 500

  const globalRows = global.map((row, i) => ({
    rank: i + 1,
    name: row.name ?? 'Anonymous',
    avatarUrl: row.image ?? undefined,
    points: Number(row.points ?? 0),
  }))

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title="Leaderboard" />

      <section className="space-y-4">
        <h2 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">
          Your progress
        </h2>
        <XpBar levelName={levelName} currentXp={stats?.totalPoints ?? 0} maxXp={maxXp} />
        <ScoreHistory weeks={history as Array<{ week: string; points: number }>} />
      </section>

      <section className="space-y-4">
        <h2 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">
          Global — this week
        </h2>
        <LeaderboardTable rows={globalRows} />
      </section>
    </div>
  )
}
