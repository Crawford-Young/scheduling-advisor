import * as React from 'react'
import { ViewTransition } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { PageHeader, StaggerReveal } from '@/lib/ui'
import { getFriends, getIncomingRequests, getOutgoingRequests } from '@/server/queries/friends'
import { RequestsSection } from '@/components/friends/requests-section'
import { FriendsSection } from '@/components/friends/friends-section'

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
      <StaggerReveal className="mx-auto max-w-5xl space-y-10">
        <PageHeader title="Friends" />
        <RequestsSection incoming={incoming} outgoing={outgoing} />
        <FriendsSection friends={friends} />
      </StaggerReveal>
    </ViewTransition>
  )
}
