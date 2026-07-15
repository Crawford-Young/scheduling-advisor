import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { EmptyState } from '@/lib/ui'
import { searchUsers } from '@/server/queries/profile'
import { PeopleSearchInput } from '@/components/profile/people-search-input'
import { PersonCard } from '@/components/profile/person-card'

interface FeedPageProps {
  readonly searchParams: Promise<{ q?: string }>
}

export default async function FeedPage({
  searchParams,
}: FeedPageProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { q } = await searchParams
  const trimmedQuery = q?.trim() ?? ''
  const results = trimmedQuery === '' ? [] : await searchUsers(session.user.id, trimmedQuery)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PeopleSearchInput />

      {trimmedQuery === '' ? (
        <EmptyState message="Search for people by name or username." />
      ) : results.length === 0 ? (
        <EmptyState message="No people found." />
      ) : (
        <div className="space-y-2">
          {results.map((result) => (
            <PersonCard key={result.username} result={result} />
          ))}
        </div>
      )}
    </div>
  )
}
