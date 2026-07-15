import * as React from 'react'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { EmptyState, StreakBadge } from '@/lib/ui'
import {
  getProfileByUsername,
  getProfileStreaks,
  getProfileStats,
  getProfileActivities,
} from '@/server/queries/profile'
import { ProfileHeader } from '@/components/profile/profile-header'
import { ProfileStats } from '@/components/profile/profile-stats'

interface ProfilePageProps {
  readonly params: Promise<{ username: string }>
}

export default async function ProfilePage({
  params,
}: ProfilePageProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { username } = await params
  const identity = await getProfileByUsername(session.user.id, username)
  if (identity === null) notFound()

  const [streaks, stats, activities] = await Promise.all([
    getProfileStreaks(session.user.id, identity.id),
    getProfileStats(session.user.id, identity.id),
    getProfileActivities(session.user.id, identity.id),
  ])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ProfileHeader identity={identity} />

      <div className="space-y-10">
        <section aria-labelledby="streaks-heading" className="space-y-4">
          <h2 id="streaks-heading" className="text-foreground text-lg font-semibold">
            Streaks
          </h2>
          {streaks.length === 0 ? (
            <EmptyState message="No streaks yet." />
          ) : (
            <ul className="space-y-2">
              {streaks.map((streak) => (
                <li key={streak.title} className="flex items-center justify-between gap-4">
                  <span>{streak.title}</span>
                  <span className="flex items-center gap-3">
                    <StreakBadge streak={streak.current} />
                    <span className="text-muted-foreground text-sm">best {streak.best}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="stats-heading" className="space-y-4">
          <h2 id="stats-heading" className="text-foreground text-lg font-semibold">
            Stats
          </h2>
          <ProfileStats stats={stats} />
        </section>

        <section aria-labelledby="activities-heading" className="space-y-4">
          <h2 id="activities-heading" className="text-foreground text-lg font-semibold">
            Activities
          </h2>
          {activities.length === 0 ? (
            <EmptyState message="No visible activities yet." />
          ) : (
            <ul className="space-y-2">
              {activities.map((activity) => (
                <li key={activity.id} className="flex items-center justify-between gap-4">
                  <span>
                    {activity.title}
                    <span className="text-muted-foreground text-sm"> · {activity.type}</span>
                    {activity.recurrence !== null && (
                      <span className="text-muted-foreground text-sm">
                        {' '}
                        · {activity.recurrence}
                      </span>
                    )}
                  </span>
                  {activity.streak > 0 && <StreakBadge streak={activity.streak} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
