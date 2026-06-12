import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { PageHeader } from '@/lib/ui'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) })

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" />
      <SettingsForm initialUsername={user?.username ?? ''} />
    </div>
  )
}
