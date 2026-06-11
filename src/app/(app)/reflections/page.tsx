import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { listConversations } from '@/server/queries/conversations'
import { ConversationTable } from '@/components/reflections/conversation-table'
import { PageHeader } from '@/lib/ui'

export default async function ReflectionsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const conversations = await listConversations()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Reflections" />
      <ConversationTable conversations={conversations} />
    </div>
  )
}
