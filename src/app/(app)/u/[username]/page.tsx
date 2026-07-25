import * as React from 'react'
import { ViewTransition } from 'react'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getProfileByUsername, getProfileWeekEvents } from '@/server/queries/profile'
import { ProfileHeader } from '@/components/profile/profile-header'
import { ProfileWeekView } from '@/components/profile/profile-week-view'
import { StaggerReveal } from '@/lib/ui'
import { resolveWeekStart } from '@/lib/calendar-week-param'

interface ProfilePageProps {
  readonly params: Promise<{ username: string }>
  readonly searchParams: Promise<{ week?: string }>
}

/**
 * Identity (A8, activity-model wave) plus a viewer-scoped, server-sanitized
 * read-only week view (visibility-w1 wave — see `getProfileWeekEvents`).
 * `WeekCalendarView` must never render inside `StaggerReveal` (it renders
 * exclusively from internal `localEvents`), so only the header section is
 * staggered; the week view is a plain sibling in the space-y-10 container.
 */
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
  const events = await getProfileWeekEvents(session.user.id, identity.id, weekStart)

  return (
    <ViewTransition enter="reveal-enter" default="none">
      <div className="mx-auto max-w-5xl space-y-10">
        <StaggerReveal className="space-y-6">
          <ProfileHeader identity={identity} />
        </StaggerReveal>
        <ProfileWeekView events={events} weekStart={weekStart} />
      </div>
    </ViewTransition>
  )
}
