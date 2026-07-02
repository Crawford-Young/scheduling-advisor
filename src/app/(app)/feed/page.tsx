import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { PageHeader, EmptyState } from '@/lib/ui'

export default async function FeedPage(): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Feed" />
      <EmptyState message="Social features coming soon — add friends to see their activity here." />
    </div>
  )
}
