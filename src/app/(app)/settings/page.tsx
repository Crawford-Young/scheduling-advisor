import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { PageHeader } from '@/lib/ui'
import { SettingsForm } from './settings-form'

function maskKey(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null
  return `••••••••${encrypted.slice(-4)}`
}

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) })
  if (!user) redirect('/login')

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" />
      <SettingsForm
        maskedAnthropicKey={maskKey(user.anthropicApiKey)}
        maskedGoogleKey={maskKey(user.googleAiApiKey)}
        activeProvider={user.activeProvider as 'anthropic' | 'google'}
        currentModel={user.preferredModel}
      />
    </div>
  )
}
