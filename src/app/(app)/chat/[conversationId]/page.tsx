import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { db } from '@/db'
import { conversations } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getConversationMessages } from '@/server/queries/conversations'
import { getTokenBalance } from '@/server/queries/tokens'
import { FullPageChatLayout } from '@/components/chat/full-page-chat-layout'
import React from 'react'

interface PageProps {
  readonly params: Promise<{ conversationId: string }>
}

export default async function ChatPage({ params }: PageProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { conversationId } = await params

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, session.user.id),
        isNull(conversations.deletedAt),
      ),
    )

  if (!conversation) notFound()

  const [initialMessages, tokenBalance] = await Promise.all([
    getConversationMessages(conversationId),
    getTokenBalance(session.user.id),
  ])

  return (
    <FullPageChatLayout
      conversation={{
        id: conversation.id,
        type: conversation.type,
        title: conversation.title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        lastMessagePreview: '',
      }}
      initialMessages={initialMessages}
      tokenBalance={tokenBalance}
    />
  )
}
