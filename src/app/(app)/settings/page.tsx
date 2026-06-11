import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/lib/ui'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" />
      <SettingsForm />
    </div>
  )
}
