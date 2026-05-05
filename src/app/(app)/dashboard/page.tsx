import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { conversations, messages } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { DashboardChat } from '@/components/chat/dashboard-chat'
import type { Message } from 'ai'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  let [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, session.user.id))
    .limit(1)

  if (!conversation) {
    const [created] = await db.insert(conversations).values({ userId: session.user.id }).returning()
    conversation = created
  }

  if (!conversation) redirect('/login')

  const dbMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(desc(messages.createdAt))
    .limit(50)

  const initialMessages: Message[] = dbMessages.reverse().map((m) => {
    const content = m.content
    const text = typeof content === 'string' ? content : ''
    return { id: m.id, role: m.role as 'user' | 'assistant', content: text }
  })

  return <DashboardChat conversationId={conversation.id} initialMessages={initialMessages} />
}
