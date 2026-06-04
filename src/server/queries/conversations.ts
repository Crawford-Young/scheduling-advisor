import { auth } from '@/auth'
import { db } from '@/db'
import { conversations, messages } from '@/db/schema'
import { eq, and, isNull, gt, desc, asc } from 'drizzle-orm'

export interface ConversationMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: 'text'; text: string } => p?.type === 'text')
      .map((p) => p.text)
      .join('')
  }
  return ''
}

export async function getConversationMessages(
  conversationId: string,
): Promise<ConversationMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))

  return rows.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: extractTextContent(m.content),
  }))
}

export interface ConversationRow {
  readonly id: string
  readonly type: 'check_in' | 'general'
  readonly title: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly lastMessagePreview: string
}

export async function listConversations(): Promise<ConversationRow[]> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, session.user.id),
        isNull(conversations.deletedAt),
        gt(conversations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(50)

  const result: ConversationRow[] = []

  for (const row of rows) {
    const lastMsgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, row.id))
      .orderBy(desc(messages.createdAt))
      .limit(1)

    const raw = lastMsgs[0]?.content
    const text = typeof raw === 'string' ? raw : ''
    const preview = text.slice(0, 80)

    result.push({
      id: row.id,
      type: row.type,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastMessagePreview: preview,
    })
  }

  return result
}
