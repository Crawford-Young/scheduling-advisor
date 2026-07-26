import * as React from 'react'
import { ViewTransition } from 'react'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getProfileByUsername, getProfileWeekEvents } from '@/server/queries/profile'
import { getFriendshipBetween, type FriendshipRow } from '@/server/queries/friends'
import { ProfileHeader } from '@/components/profile/profile-header'
import { ProfileWeekView } from '@/components/profile/profile-week-view'
import { FriendButton, type FriendshipView } from '@/components/profile/friend-button'
import { StaggerReveal } from '@/lib/ui'
import { resolveWeekStart } from '@/lib/calendar-week-param'

interface ProfilePageProps {
  readonly params: Promise<{ username: string }>
  readonly searchParams: Promise<{ week?: string }>
}

interface FriendshipViewResult {
  readonly view: FriendshipView
  readonly friendshipId: string | null
}

/** Derives the viewer's relationship to the profile owner from their friendship row, if any. */
function deriveFriendshipView(
  friendship: FriendshipRow | null,
  viewerId: string,
): FriendshipViewResult {
  if (friendship === null) return { view: 'none', friendshipId: null }
  if (friendship.status === 'accepted') return { view: 'friends', friendshipId: friendship.id }
  const view: FriendshipView = friendship.requesterId === viewerId ? 'outgoing' : 'incoming'
  return { view, friendshipId: friendship.id }
}

/**
 * Identity (A8, activity-model wave) plus a viewer-scoped, server-sanitized
 * read-only week view (visibility-w1 wave — see `getProfileWeekEvents`), plus
 * a friend-request control for non-owner viewers (cybond-friends wave).
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

  const friendship = identity.isOwner
    ? null
    : await getFriendshipBetween(session.user.id, identity.id)
  const { view, friendshipId } = deriveFriendshipView(friendship, session.user.id)

  return (
    <ViewTransition enter="reveal-enter" default="none">
      <div className="mx-auto max-w-5xl space-y-10">
        <StaggerReveal className="space-y-6">
          <ProfileHeader
            identity={identity}
            action={
              !identity.isOwner ? (
                <FriendButton profileUserId={identity.id} view={view} friendshipId={friendshipId} />
              ) : undefined
            }
          />
        </StaggerReveal>
        <ProfileWeekView events={events} weekStart={weekStart} />
      </div>
    </ViewTransition>
  )
}
