import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { decrypt } from '@/lib/encryption'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

  let maskedKey: string | null = null
  if (user?.anthropicApiKey) {
    const decrypted = decrypt(user.anthropicApiKey)
    maskedKey = `sk-ant-••••••••${decrypted.slice(-4)}`
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <Link href="/dashboard" aria-label="Back to dashboard">
          <ArrowLeft className="text-muted-foreground hover:text-foreground h-5 w-5 transition-colors" />
        </Link>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <SettingsForm
        maskedApiKey={maskedKey}
        currentModel={user?.preferredModel ?? 'claude-sonnet-4-6'}
      />
    </div>
  )
}
