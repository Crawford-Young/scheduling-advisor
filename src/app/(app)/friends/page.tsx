import * as React from 'react'
import { ViewTransition } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { PageHeader, StaggerReveal } from '@/lib/ui'
import { getFriends, getIncomingRequests, getOutgoingRequests } from '@/server/queries/friends'
import { FriendsTabs } from '@/components/friends/friends-tabs'

export default async function FriendsPage(): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [friends, incoming, outgoing] = await Promise.all([
    getFriends(session.user.id),
    getIncomingRequests(session.user.id),
    getOutgoingRequests(session.user.id),
  ])

  return (
    <ViewTransition enter="reveal-enter" default="none">
      <StaggerReveal className="mx-auto max-w-5xl space-y-6">
        <PageHeader title="Friends" />
        <FriendsTabs friends={friends} incoming={incoming} outgoing={outgoing} />
      </StaggerReveal>
    </ViewTransition>
  )
}
