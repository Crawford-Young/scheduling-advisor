'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { conversations } from '@/db/schema'
import { eq } from 'drizzle-orm'

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
    .set({ deletedAt: new Date() })
    .where(eq(conversations.id, conversationId))
}

export async function setConversationTitle(conversationId: string, title: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const [row] = await db.select().from(conversations).where(eq(conversations.id, conversationId))

  if (!row) return
  if (row.userId !== session.user.id) throw new Error('Forbidden')
  if (row.title !== null) return

  await db.update(conversations).set({ title }).where(eq(conversations.id, conversationId))
}

export async function bumpConversationExpiry(conversationId: string): Promise<void> {
  await db
    .update(conversations)
    .set({ expiresAt: thirtyDaysFromNow() })
    .where(eq(conversations.id, conversationId))
}
