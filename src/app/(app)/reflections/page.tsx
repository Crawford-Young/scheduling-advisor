import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { listConversations } from '@/server/queries/conversations'
import { ConversationTable } from '@/components/reflections/conversation-table'
import { NewConversationButton } from '@/components/reflections/new-conversation-button'

export default async function ReflectionsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const conversations = await listConversations()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-end gap-3">
        <NewConversationButton />
      </div>
      <ConversationTable conversations={conversations} />
    </div>
  )
}
