'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { WeekCalendarView, type CalendarEvent } from '@/lib/ui'
import type { ProfileWeekEvent } from '@/server/queries/profile'

const BUSY_TITLE = 'Busy'
const HOUR_START = 0
const HOUR_COUNT = 24

interface ProfileWeekViewProps {
  readonly events: readonly ProfileWeekEvent[]
  readonly weekStart: string
}

// Never spread from `ProfileWeekEvent` — field-by-field mirrors the
// server-side sanitization discipline in `src/server/queries/profile.ts`.
function toLibraryEvent(event: ProfileWeekEvent): CalendarEvent {
  if (event.kind === 'busy') {
    return {
      id: event.id,
      title: BUSY_TITLE,
      start: event.startAt.toISOString(),
      end: event.endAt.toISOString(),
      color: 'default',
      completable: false,
    }
  }
  const color = event.color ? (event.color as CalendarEvent['color']) : 'default'
  return {
    id: event.id,
    title: event.title,
    start: event.startAt.toISOString(),
    end: event.endAt.toISOString(),
    color,
    allDay: event.allDay,
    location: event.location ?? undefined,
    description: event.description ?? undefined,
    completed: event.completed,
    completable: false,
  }
}

/**
 * Genuinely read-only week view for `/u/[username]`: it wires ONLY
 * `onWeekChange` — no `onEvent*` mutation handlers — so the lib's chip
 * affordances (edit/delete/complete/lock) render nothing per the
 * `@crawfordyoung/ui` >=0.29.1 zero-handler gating (V1 of this wave).
 */
export function ProfileWeekView({ events, weekStart }: ProfileWeekViewProps): React.JSX.Element {
  const router = useRouter()

  return (
    <div data-testid="profile-week-calendar">
      <WeekCalendarView
        defaultWeekStart={weekStart}
        events={events.map(toLibraryEvent)}
        // The library never re-derives from props on its own — it seeds
        // `localEvents` once and only re-seeds in place on a `resyncToken`
        // identity change (see the AGENTS.md resyncToken entry). This view
        // is fully server-driven (week nav -> router.replace -> RSC refetch
        // brings new `events` + `weekStart` together), so bumping the token
        // on `weekStart` is exactly the re-seed trigger; without it,
        // week-windowed events would render an empty grid on in-view nav.
        resyncToken={weekStart}
        hourStart={HOUR_START}
        hourCount={HOUR_COUNT}
        onWeekChange={(week) => {
          const params = new URLSearchParams(window.location.search)
          params.set('week', week)
          // Programmatic nav under experimental.viewTransition must run inside
          // a React transition or the browser aborts it (InvalidStateError) —
          // see the AGENTS.md live-QA-only entry; same fix as
          // calendar-client.tsx's onWeekChange handler.
          React.startTransition(() => router.replace(`?${params.toString()}`, { scroll: false }))
        }}
      />
    </div>
  )
}
