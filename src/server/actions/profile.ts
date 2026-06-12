'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { usernameSchema } from '@/lib/schemas/username'
import { revalidatePath } from 'next/cache'

export async function setUsername(raw: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const username = usernameSchema.parse(raw)
  await db.update(users).set({ username }).where(eq(users.id, session.user.id))
  revalidatePath('/settings')
}
