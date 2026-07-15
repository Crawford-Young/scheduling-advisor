'use client'
import * as React from 'react'
import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { WeekCalendarView, SleepToggle, type CalendarEvent } from '@/lib/ui'
import type { ProfileWeekEvent } from '@/server/queries/profile'

// Full 24h grid for the SleepToggle's "show full day" state — the windowed
// state instead uses the VIEWER's own wakeHour/sleepHour (never the profile
// owner's, which would leak the owner's private sleep schedule).
const FULL_DAY_HOUR_START = 0
const FULL_DAY_HOUR_COUNT = 24
const DEFAULT_COLOR: CalendarEvent['color'] = 'default'

/**
 * Maps a query-shaped `ProfileWeekEvent` to the library's `CalendarEvent`.
 *
 * Read-only trap (AGENTS.md — WeekCalendarView/resyncToken; library
 * `calendar-event-chip.tsx:480` gates resize handles on `!isLocked`;
 * `week-calendar-view.tsx:879-890` gates drag-create; `:997` gates move):
 * every mapped event is `locked: true`, and `ProfileWeekView` below wires NO
 * mutation handlers on `WeekCalendarView`. The lock icon itself only renders
 * when `onToggleLock` is wired (chip.tsx:409,802) — so this combination (lock
 * + zero handlers) yields a fully inert, icon-less chip, not a visibly locked
 * one.
 *
 * Masked rows (`event.masked === true`) already arrive scrubbed from
 * `getProfileWeekEvents` (title `'Busy'`, `color`/`location`/`description`
 * all `null`) — this mapper only translates field names/fallbacks and must
 * never re-derive or add back detail for either masked or unmasked rows.
 */
function toLibraryEvent(event: ProfileWeekEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    color: event.color !== null ? (event.color as CalendarEvent['color']) : DEFAULT_COLOR,
    allDay: event.allDay,
    location: event.location ?? undefined,
    description: event.description ?? undefined,
    locked: true,
  }
}

interface ProfileWeekViewProps {
  readonly events: readonly ProfileWeekEvent[]
  readonly weekStart: string
  /** Viewer's own wake hour (never the profile owner's) for the windowed view. */
  readonly wakeHour: number
  /** Viewer's own sleep hour (never the profile owner's) for the windowed view. */
  readonly sleepHour: number
  /** Viewer's own per-day awake windows, fractional hours, Sun-first. */
  readonly dayWindows: readonly { wake: number; sleep: number }[]
}

/**
 * Read-only week calendar for a public profile page.
 *
 * resyncToken/remount trap interaction (AGENTS.md): `WeekCalendarView` seeds
 * its internal nav/event state once at mount and only re-derives from props
 * on a `resyncToken` identity bump — a plain prop update (new `events`/
 * `defaultWeekStart`) is otherwise invisible to it, the same limitation
 * AGENTS.md documents for the authenticated calendar's browser back/forward.
 * This component carries NO resyncToken plumbing; instead the caller
 * (`u/[username]/page.tsx`) keys its `<ProfileWeekView key={weekStart} .../>`
 * usage by the resolved week, so every `?week=` change — whether from this
 * component's own `onWeekChange` below or a direct URL edit — forces a full
 * remount on the next server render instead of a prop update the library
 * would ignore. A full remount is safe here (unlike the authenticated
 * `CalendarClient`, which avoids remounts specifically to preserve in-flight
 * optimistic mutations) because this view is fully read-only: there is no
 * client state worth preserving across a week navigation.
 *
 * Wake/sleep windowing (AGENTS.md "Calendar wake→sleep window semantics"
 * trap): mirrors `CalendarClient`'s derivation exactly. `wakeHour`/`sleepHour`/
 * `dayWindows` are the VIEWER's own calendar prefs — never the profile
 * owner's, which would leak the owner's private sleep schedule. Default is
 * windowed (`sleepEnabled=false`, `hourStart`/`hourCount` from wake/sleep);
 * `SleepToggle` flips `showFullDay`, which forces `sleepEnabled=true` — the
 * library then IGNORES `hourStart`/`hourCount` and renders the full 24h grid
 * with shaded sleep zones, so the two states stay consistent by construction.
 */
export function ProfileWeekView({
  events,
  weekStart,
  wakeHour,
  sleepHour,
  dayWindows,
}: ProfileWeekViewProps): React.JSX.Element {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [showFullDay, setShowFullDay] = useState(false)

  const hourStart = showFullDay ? FULL_DAY_HOUR_START : wakeHour
  const hourCount = showFullDay ? FULL_DAY_HOUR_COUNT : sleepHour - wakeHour
  const sleepEnabled = showFullDay
  const sleepStart = sleepHour
  const sleepEnd = wakeHour

  function handleWeekChange(newWeekStart: string): void {
    const params = new URLSearchParams(searchParams.toString())
    params.set('week', newWeekStart)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-end gap-4">
        <SleepToggle enabled={!showFullDay} onToggle={(windowed) => setShowFullDay(!windowed)} />
      </div>
      <WeekCalendarView
        events={events.map(toLibraryEvent)}
        defaultWeekStart={weekStart}
        sleepEnabled={sleepEnabled}
        hourStart={hourStart}
        hourCount={hourCount}
        sleepStart={sleepStart}
        sleepEnd={sleepEnd}
        dayWindows={dayWindows}
        onWeekChange={handleWeekChange}
      />
    </>
  )
}
