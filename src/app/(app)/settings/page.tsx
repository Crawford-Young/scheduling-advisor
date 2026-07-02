import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { SettingsForm } from './settings-form'
import { getCalendarPrefs } from '@/server/queries/calendar-prefs'
import { DEFAULT_WAKE_MINUTES, DEFAULT_SLEEP_MINUTES } from '@/lib/calendar-windows'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) })
  const prefs = await getCalendarPrefs()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SettingsForm
        initialUsername={user?.username ?? ''}
        initialWakeHour={prefs?.workingHoursStart ?? DEFAULT_WAKE_MINUTES}
        initialSleepHour={prefs?.workingHoursEnd ?? DEFAULT_SLEEP_MINUTES}
        initialUse24h={prefs?.use24h ?? false}
        initialDayOverrides={prefs?.dayOverrides ?? {}}
      />
    </div>
  )
}
