import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProfileWeekView } from './profile-week-view'
import type { ProfileWeekEvent } from '@/server/queries/profile'

const replaceMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

vi.mock('@/lib/ui', () => ({
  WeekCalendarView: (props: Record<string, unknown>) => (
    <div
      data-testid="week-calendar-view"
      data-default-week-start={String(props.defaultWeekStart ?? '')}
      data-resync-token={String(props.resyncToken ?? '')}
      data-hour-start={String(props.hourStart ?? '')}
      data-hour-count={String(props.hourCount ?? '')}
      data-use24h={String('use24h' in props)}
      data-has-event-edit={String('onEventEdit' in props)}
      data-has-event-delete={String('onEventDelete' in props)}
      data-has-event-toggle-complete={String('onEventToggleComplete' in props)}
      data-has-event-toggle-lock={String('onEventToggleLock' in props)}
      data-has-event-create={String('onEventCreate' in props)}
      data-has-event-move={String('onEventMove' in props)}
      data-has-event-resize={String('onEventResize' in props)}
      data-events={JSON.stringify(props.events ?? [])}
    >
      <button
        type="button"
        onClick={() => (props.onWeekChange as ((week: string) => void) | undefined)?.('2026-07-26')}
      >
        trigger-week-change
      </button>
    </div>
  ),
}))

const PUBLIC_EVENT: ProfileWeekEvent = {
  kind: 'public',
  id: 'evt-1',
  title: 'Team standup',
  startAt: new Date(2026, 6, 20, 9, 0, 0),
  endAt: new Date(2026, 6, 20, 9, 30, 0),
  allDay: false,
  color: 'blue',
  location: 'Room 4',
  description: 'daily sync',
  completed: false,
}

const BUSY_EVENT: ProfileWeekEvent = {
  kind: 'busy',
  id: 'evt-2',
  startAt: new Date(2026, 6, 21, 13, 0, 0),
  endAt: new Date(2026, 6, 21, 14, 0, 0),
}

describe('ProfileWeekView', () => {
  beforeEach(() => {
    replaceMock.mockClear()
  })

  it('threads defaultWeekStart and the full 24h window to WeekCalendarView', () => {
    render(<ProfileWeekView events={[]} weekStart="2026-07-19" />)

    const view = screen.getByTestId('week-calendar-view')
    expect(view).toHaveAttribute('data-default-week-start', '2026-07-19')
    expect(view).toHaveAttribute('data-hour-start', '0')
    expect(view).toHaveAttribute('data-hour-count', '24')
  })

  it('threads resyncToken as weekStart, so a server-refetched week re-seeds localEvents', () => {
    render(<ProfileWeekView events={[]} weekStart="2026-07-19" />)

    expect(screen.getByTestId('week-calendar-view')).toHaveAttribute(
      'data-resync-token',
      '2026-07-19',
    )
  })

  it('does not thread use24h (viewer default)', () => {
    render(<ProfileWeekView events={[]} weekStart="2026-07-19" />)

    expect(screen.getByTestId('week-calendar-view')).toHaveAttribute('data-use24h', 'false')
  })

  it('passes no mutation handlers — genuinely read-only per the V1 lib gating', () => {
    render(<ProfileWeekView events={[]} weekStart="2026-07-19" />)

    const view = screen.getByTestId('week-calendar-view')
    expect(view).toHaveAttribute('data-has-event-edit', 'false')
    expect(view).toHaveAttribute('data-has-event-delete', 'false')
    expect(view).toHaveAttribute('data-has-event-toggle-complete', 'false')
    expect(view).toHaveAttribute('data-has-event-toggle-lock', 'false')
    expect(view).toHaveAttribute('data-has-event-create', 'false')
    expect(view).toHaveAttribute('data-has-event-move', 'false')
    expect(view).toHaveAttribute('data-has-event-resize', 'false')
  })

  it('maps a public event to a full library CalendarEvent', () => {
    render(<ProfileWeekView events={[PUBLIC_EVENT]} weekStart="2026-07-19" />)

    const events: unknown = JSON.parse(
      screen.getByTestId('week-calendar-view').dataset.events ?? '[]',
    )
    expect(events).toEqual([
      {
        id: 'evt-1',
        title: 'Team standup',
        start: PUBLIC_EVENT.startAt.toISOString(),
        end: PUBLIC_EVENT.endAt.toISOString(),
        color: 'blue',
        allDay: false,
        location: 'Room 4',
        description: 'daily sync',
        completed: false,
        completable: false,
      },
    ])
  })

  it('falls back to the default color swatch when a public event has no color', () => {
    render(<ProfileWeekView events={[{ ...PUBLIC_EVENT, color: null }]} weekStart="2026-07-19" />)

    const events: Array<{ color: string }> = JSON.parse(
      screen.getByTestId('week-calendar-view').dataset.events ?? '[]',
    )
    expect(events[0]?.color).toBe('default')
  })

  it('maps a busy event to a sanitized "Busy" chip with no title/location/description leak', () => {
    render(<ProfileWeekView events={[BUSY_EVENT]} weekStart="2026-07-19" />)

    const events: unknown = JSON.parse(
      screen.getByTestId('week-calendar-view').dataset.events ?? '[]',
    )
    expect(events).toEqual([
      {
        id: 'evt-2',
        title: 'Busy',
        start: BUSY_EVENT.startAt.toISOString(),
        end: BUSY_EVENT.endAt.toISOString(),
        color: 'default',
        completable: false,
      },
    ])
  })

  it('maps null location/description to undefined on a public event', () => {
    render(
      <ProfileWeekView
        events={[{ ...PUBLIC_EVENT, location: null, description: null }]}
        weekStart="2026-07-19"
      />,
    )

    const events: Array<{ location?: string; description?: string }> = JSON.parse(
      screen.getByTestId('week-calendar-view').dataset.events ?? '[]',
    )
    expect(events[0]?.location).toBeUndefined()
    expect(events[0]?.description).toBeUndefined()
  })

  it('writes ?week= via router.replace inside a transition on week change, preserving other params', async () => {
    window.history.replaceState({}, '', '/u/ada?tab=week')
    const user = userEvent.setup()
    render(<ProfileWeekView events={[]} weekStart="2026-07-19" />)

    await user.click(screen.getByRole('button', { name: 'trigger-week-change' }))

    expect(replaceMock).toHaveBeenCalledWith('?tab=week&week=2026-07-26', { scroll: false })
  })
})
