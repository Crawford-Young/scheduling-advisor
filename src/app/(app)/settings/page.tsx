import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { PageHeader } from '@/lib/ui'
import { SettingsForm } from './settings-form'
import { getCalendarPrefs } from '@/server/queries/calendar-prefs'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) })
  const prefs = await getCalendarPrefs()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Settings" />
      <SettingsForm
        initialUsername={user?.username ?? ''}
        initialWakeHour={prefs?.workingHoursStart ?? 9}
        initialSleepHour={prefs?.workingHoursEnd ?? 17}
        initialUse24h={prefs?.use24h ?? false}
        initialDayOverrides={prefs?.dayOverrides ?? {}}
      />
    </div>
  )
}
