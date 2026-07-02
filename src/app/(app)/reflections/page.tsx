import * as React from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { listConversations, type ConversationRow } from '@/server/queries/conversations'
import { ConversationTable } from '@/components/reflections/conversation-table'
import { ConversationFilters } from '@/components/reflections/conversation-filters'
import { NewConversationButton } from '@/components/reflections/new-conversation-button'

type ConversationType = ConversationRow['type']

const FILTER_TYPES: readonly ConversationType[] = ['check_in', 'general']

function resolveFilter(type: string | undefined): ConversationType | 'all' {
  return FILTER_TYPES.includes(type as ConversationType) ? (type as ConversationType) : 'all'
}

interface ReflectionsPageProps {
  readonly searchParams: Promise<{ type?: string; q?: string }>
}

export default async function ReflectionsPage({
  searchParams,
}: ReflectionsPageProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { type, q } = await searchParams
  const filter = resolveFilter(type)

  const allConversations = await listConversations()
  const conversations = allConversations
    .filter((c) => filter === 'all' || c.type === filter)
    .filter((c) => !q || (c.title ?? '').toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <ConversationFilters />
        </div>
        <NewConversationButton />
      </div>
      <ConversationTable conversations={conversations} />
    </div>
  )
}
