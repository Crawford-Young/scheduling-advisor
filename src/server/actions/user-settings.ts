'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { encrypt } from '@/lib/encryption'
import { revalidatePath } from 'next/cache'
import { modelSchema, providerSchema, DEFAULT_MODEL_BY_PROVIDER } from '@/lib/schemas/user-settings'
import { ratelimit } from '@/lib/redis'

interface ActionResult {
  readonly error?: string
}

/** Saves (or updates) the user's Anthropic API key, encrypted at rest. */
export async function saveAnthropicKey(formData: FormData): Promise<ActionResult> {
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

/** Clears the user's Anthropic API key. */
export async function clearAnthropicKey(): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  await db.update(users).set({ anthropicApiKey: null }).where(eq(users.id, session.user.id))
  revalidatePath('/settings')
  return {}
}

/** Saves (or updates) the user's Google AI Studio API key, encrypted at rest. */
export async function saveGoogleAiKey(formData: FormData): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const raw = formData.get('apiKey')
  const key = typeof raw === 'string' ? raw.trim() : ''
  if (!key) return { error: 'API key is required' }

  await db
    .update(users)
    .set({ googleAiApiKey: encrypt(key) })
    .where(eq(users.id, session.user.id))

  revalidatePath('/settings')
  return {}
}

/** Clears the user's Google AI Studio API key. */
export async function clearGoogleAiKey(): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  await db.update(users).set({ googleAiApiKey: null }).where(eq(users.id, session.user.id))
  revalidatePath('/settings')
  return {}
}

/** Switches the active LLM provider and resets preferredModel to that provider's default. */
export async function saveProvider(provider: string): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = providerSchema.safeParse(provider)
  if (!parsed.success) return { error: 'Invalid provider' }

  await db
    .update(users)
    .set({
      activeProvider: parsed.data,
      preferredModel: DEFAULT_MODEL_BY_PROVIDER[parsed.data],
    })
    .where(eq(users.id, session.user.id))

  revalidatePath('/settings')
  return {}
}

/** Updates the user's preferred model within their active provider. */
export async function saveModelPreference(model: string): Promise<ActionResult> {
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
