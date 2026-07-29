import { ViewTransition, type CSSProperties } from 'react'
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
import { SettingsNav } from './settings-nav'

// Drives both the scroll offset and the last section's spacer, so they cannot
// drift apart: pt-6 (1.5rem) + the size="sm" button's h-8 (2rem) + pb-3 (0.75rem).
const SETTINGS_NAV_STYLE = { '--settings-nav-h': '4.25rem' } as CSSProperties

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) })
  const prefs = await getCalendarPrefs()
  const calendarStatus = await getCalendarConnection(session.user.id)

  return (
    <ViewTransition enter="reveal-enter" default="none">
      <div className="mx-auto max-w-5xl" style={SETTINGS_NAV_STYLE}>
        <SettingsNav />
        <StaggerReveal className="space-y-10 pt-6">
          <section id="profile" className="scroll-mt-[var(--settings-nav-h)]">
            <ProfileSection
              initialName={user?.name ?? ''}
              initialBio={user?.bio ?? ''}
              initialUsername={user?.username ?? ''}
            />
          </section>
          <section id="calendar" className="scroll-mt-[var(--settings-nav-h)]">
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
          </section>
          <section
            id="integrations"
            className="min-h-[calc(100dvh-3rem-1.5rem-var(--settings-nav-h))] scroll-mt-[var(--settings-nav-h)]"
          >
            <IntegrationsSection status={calendarStatus} />
          </section>
        </StaggerReveal>
      </div>
    </ViewTransition>
  )
}
