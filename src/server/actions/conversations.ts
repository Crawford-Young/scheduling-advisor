'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { conversations } from '@/db/schema'
import { eq, and, isNull, gt, desc } from 'drizzle-orm'
import { getConversationMessages, type ConversationMessage } from '@/server/queries/conversations'

export type ConversationType = 'check_in' | 'general'

function checkInTitle(): string {
  return (
    new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }) + ' daily check-in'
  )
}

function thirtyDaysFromNow(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d
}

export async function createConversation(type: ConversationType): Promise<{ id: string }> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const rows = await db
    .insert(conversations)
    .values({
      userId: session.user.id,
      type,
      title: type === 'check_in' ? checkInTitle() : null,
      expiresAt: thirtyDaysFromNow(),
    })
    .returning()

  const row = rows[0]
  if (!row) throw new Error('Insert failed')
  return { id: row.id }
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const [row] = await db.select().from(conversations).where(eq(conversations.id, conversationId))

  if (!row) throw new Error('NotFound')
  if (row.userId !== session.user.id) throw new Error('Forbidden')

  await db
    .update(conversations)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
}

export async function setConversationTitle(conversationId: string, title: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const [row] = await db.select().from(conversations).where(eq(conversations.id, conversationId))

  if (!row) return
  if (row.userId !== session.user.id) throw new Error('Forbidden')
  if (row.title !== null) return

  await db
    .update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
}

export async function bumpConversationExpiry(conversationId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const [row] = await db.select().from(conversations).where(eq(conversations.id, conversationId))

  if (!row || row.userId !== session.user.id) return // silent — called from AI pipeline

  await db
    .update(conversations)
    .set({ expiresAt: thirtyDaysFromNow(), updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
}

export async function getLatestConversation(): Promise<{
  id: string
  title: string | null
} | null> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const rows = await db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, session.user.id),
        isNull(conversations.deletedAt),
        gt(conversations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(1)

  return rows[0] ?? null
}

// getConversationMessages (src/server/queries/conversations.ts) performs no
// auth or ownership check itself, so this wrapper enforces both before
// delegating — mirrors the guard pattern used by deleteConversation above.
export async function getConversationMessagesAction(
  conversationId: string,
): Promise<ConversationMessage[]> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const [row] = await db.select().from(conversations).where(eq(conversations.id, conversationId))

  if (!row) throw new Error('NotFound')
  if (row.userId !== session.user.id) throw new Error('Forbidden')

  return getConversationMessages(conversationId)
}
