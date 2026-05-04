'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { encrypt } from '@/lib/encryption'
import { revalidatePath } from 'next/cache'
import { modelSchema } from '@/lib/schemas/user-settings'
import { ratelimit } from '@/lib/redis'

export async function saveApiKey(formData: FormData): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

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

export async function clearApiKey(): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  await db.update(users).set({ anthropicApiKey: null }).where(eq(users.id, session.user.id))
  revalidatePath('/settings')
  return {}
}

export async function saveModelPreference(model: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = modelSchema.safeParse(model)
  if (!parsed.success) return { error: 'Invalid model' }

  await db.update(users).set({ preferredModel: parsed.data }).where(eq(users.id, session.user.id))

  revalidatePath('/settings')
  return {}
}
