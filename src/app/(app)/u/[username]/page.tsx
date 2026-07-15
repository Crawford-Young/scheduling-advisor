import * as React from 'react'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { EmptyState, StreakBadge } from '@/lib/ui'
import {
  getProfileByUsername,
  getProfileStreaks,
  getProfileStats,
  getProfileActivities,
  getProfileWeekEvents,
} from '@/server/queries/profile'
import { getCalendarPrefs } from '@/server/queries/calendar-prefs'
import { ProfileHeader } from '@/components/profile/profile-header'
import { ProfileStats } from '@/components/profile/profile-stats'
import { ProfileWeekView } from '@/components/profile/profile-week-view'
import { resolveWeekStart } from '@/lib/calendar-week-param'
import {
  DEFAULT_WAKE_MINUTES,
  DEFAULT_SLEEP_MINUTES,
  resolveDayWindows,
} from '@/lib/calendar-windows'

const MINUTES_PER_HOUR = 60

interface ProfilePageProps {
  readonly params: Promise<{ username: string }>
  readonly searchParams: Promise<{ week?: string }>
}

export default async function ProfilePage({
  params,
  searchParams,
}: ProfilePageProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { username } = await params
  const identity = await getProfileByUsername(session.user.id, username)
  if (identity === null) notFound()

  const { week } = await searchParams
  const weekStart = resolveWeekStart(week)

  const [streaks, stats, activities, weekEvents, prefs] = await Promise.all([
    getProfileStreaks(session.user.id, identity.id),
    getProfileStats(session.user.id, identity.id),
    getProfileActivities(session.user.id, identity.id),
    getProfileWeekEvents(session.user.id, identity.id, weekStart),
    getCalendarPrefs(),
  ])

  // Windowing is the VIEWER's own calendarPrefs (the SESSION user, read by
  // getCalendarPrefs()) — never the profile owner's, which would leak the
  // owner's private sleep schedule. Derivation mirrors calendar/page.tsx
  // exactly (AGENTS.md "Calendar wake→sleep window semantics" trap).
  const wakeHour = Math.floor((prefs?.workingHoursStart ?? DEFAULT_WAKE_MINUTES) / MINUTES_PER_HOUR)
  const sleepHour = Math.ceil((prefs?.workingHoursEnd ?? DEFAULT_SLEEP_MINUTES) / MINUTES_PER_HOUR)
  const dayWindows = resolveDayWindows(prefs).map((w) => ({
    wake: w.wake / MINUTES_PER_HOUR,
    sleep: w.sleep / MINUTES_PER_HOUR,
  }))

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

        <section aria-labelledby="week-heading" className="space-y-4">
          <h2 id="week-heading" className="text-foreground text-lg font-semibold">
            Week
          </h2>
          {/* Keyed by weekStart: forces a full remount on every ?week= nav
              instead of a prop update, which WeekCalendarView would otherwise
              ignore (resyncToken trap — see ProfileWeekView's doc comment). */}
          <ProfileWeekView
            key={weekStart}
            events={weekEvents}
            weekStart={weekStart}
            wakeHour={wakeHour}
            sleepHour={sleepHour}
            dayWindows={dayWindows}
          />
        </section>
      </div>
    </div>
  )
}
