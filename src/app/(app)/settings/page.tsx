import { ViewTransition } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { SettingsForm } from './settings-form'
import { ProfileSection } from './profile-section'
import { IntegrationsSection } from './integrations-section'
import { getCalendarPrefs } from '@/server/queries/calendar-prefs'
import { getCalendarConnection } from '@/server/queries/google-calendar-connection'
import {
  DEFAULT_WAKE_MINUTES,
  DEFAULT_SLEEP_MINUTES,
  MAX_DISPLAY_MINUTES,
} from '@/lib/calendar-windows'
import { StaggerReveal } from '@/lib/ui'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) })
  const prefs = await getCalendarPrefs()
  const calendarStatus = await getCalendarConnection(session.user.id)

  return (
    <ViewTransition enter="reveal-enter" default="none">
      <StaggerReveal className="mx-auto max-w-5xl space-y-10">
        <ProfileSection
          initialName={user?.name ?? ''}
          initialBio={user?.bio ?? ''}
          initialUsername={user?.username ?? ''}
        />
        <SettingsForm
          initialWakeMinutes={prefs?.workingHoursStart ?? DEFAULT_WAKE_MINUTES}
          // TimeInput has no 24:00 representation; migrated hour-24 (1440) rows clamp to 23:59.
          initialSleepMinutes={Math.min(
            prefs?.workingHoursEnd ?? DEFAULT_SLEEP_MINUTES,
            MAX_DISPLAY_MINUTES,
          )}
          initialUse24h={prefs?.use24h ?? false}
          initialDayOverrides={prefs?.dayOverrides ?? {}}
          initialTtlDays={prefs?.ttlDays ?? null}
          initialDefaultVisibility={prefs?.defaultVisibility ?? 'private'}
        />
        <IntegrationsSection status={calendarStatus} />
      </StaggerReveal>
    </ViewTransition>
  )
}
