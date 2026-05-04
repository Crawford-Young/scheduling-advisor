'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { encrypt } from '@/lib/encryption'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const modelSchema = z.enum(['claude-sonnet-4-6', 'claude-opus-4-7'])

export async function saveApiKey(formData: FormData): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const raw = formData.get('apiKey')
  const key = typeof raw === 'string' ? raw.trim() : ''
  if (!key) return { error: 'API key is required' }

  await db
    .update(users)
    .set({ anthropicApiKey: encrypt(key) })
    .where(eq(users.id, session.user.id))

  revalidatePath('/settings')
  return {}
}

export async function clearApiKey(): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return

  await db.update(users).set({ anthropicApiKey: null }).where(eq(users.id, session.user.id))
  revalidatePath('/settings')
}

export async function saveModelPreference(model: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const parsed = modelSchema.safeParse(model)
  if (!parsed.success) return { error: 'Invalid model' }

  await db.update(users).set({ preferredModel: parsed.data }).where(eq(users.id, session.user.id))

  revalidatePath('/settings')
  return {}
}
