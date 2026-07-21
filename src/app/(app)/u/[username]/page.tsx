import * as React from 'react'
import { ViewTransition } from 'react'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getProfileByUsername } from '@/server/queries/profile'
import { ProfileHeader } from '@/components/profile/profile-header'
import { StaggerReveal } from '@/lib/ui'

interface ProfilePageProps {
  readonly params: Promise<{ username: string }>
}

/**
 * Trimmed to identity only (A8, activity-model wave): the tasks-backed
 * streaks/stats/activities/week-view sections were removed along with the
 * old model. Profile v2 (activities/events + a visibility model) is a
 * queued follow-up wave.
 */
export default async function ProfilePage({
  params,
}: ProfilePageProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { username } = await params
  const identity = await getProfileByUsername(session.user.id, username)
  if (identity === null) notFound()

  return (
    <ViewTransition enter="reveal-enter" default="none">
      <StaggerReveal className="mx-auto max-w-5xl space-y-6">
        <ProfileHeader identity={identity} />
      </StaggerReveal>
    </ViewTransition>
  )
}
