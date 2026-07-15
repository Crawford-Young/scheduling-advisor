import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProfileWeekView } from './profile-week-view'
import type { ProfileWeekEvent } from '@/server/queries/profile'
import type { WeekCalendarViewProps } from '@/lib/ui'

const replaceMock = vi.fn()
let currentParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/u/ada',
  useSearchParams: () => currentParams,
}))

let capturedProps: WeekCalendarViewProps | null = null

vi.mock('@/lib/ui', () => ({
  WeekCalendarView: (props: WeekCalendarViewProps) => {
    capturedProps = props
    return <div data-testid="week-calendar-view" />
  },
  SleepToggle: ({
    enabled,
    onToggle,
  }: {
    enabled: boolean
    onToggle: (enabled: boolean) => void
    className?: string
  }) => (
    <button type="button" onClick={() => onToggle(!enabled)}>
      sleep-toggle
    </button>
  ),
}))

const WAKE_HOUR = 9
const SLEEP_HOUR = 17
const DAY_WINDOWS: readonly { wake: number; sleep: number }[] = Array.from(
  { length: 7 },
  (_, day) => ({ wake: 8 + day, sleep: 16 + day }),
)

function makeEvent(overrides: Partial<ProfileWeekEvent> = {}): ProfileWeekEvent {
  return {
    id: 'evt-1',
    title: 'Morning Run',
    start: '2026-06-01T09:00:00.000Z',
    end: '2026-06-01T10:00:00.000Z',
    color: 'blue',
    allDay: false,
    location: 'Park',
    description: 'Loop the park',
    masked: false,
    ...overrides,
  }
}

interface RenderOverrides {
  readonly events?: readonly ProfileWeekEvent[]
  readonly weekStart?: string
  readonly wakeHour?: number
  readonly sleepHour?: number
  readonly dayWindows?: readonly { wake: number; sleep: number }[]
}

function renderView(overrides: RenderOverrides = {}) {
  return render(
    <ProfileWeekView
      events={overrides.events ?? [makeEvent()]}
      weekStart={overrides.weekStart ?? '2026-06-01'}
      wakeHour={overrides.wakeHour ?? WAKE_HOUR}
      sleepHour={overrides.sleepHour ?? SLEEP_HOUR}
      dayWindows={overrides.dayWindows ?? DAY_WINDOWS}
    />,
  )
}

function props(): WeekCalendarViewProps {
  if (capturedProps === null) throw new Error('WeekCalendarView was not rendered')
  return capturedProps
}

describe('ProfileWeekView', () => {
  beforeEach(() => {
    replaceMock.mockClear()
    currentParams = new URLSearchParams()
    capturedProps = null
  })

  it('locks every mapped event, masked or not', () => {
    const events = [
      makeEvent({ id: 'unmasked', masked: false }),
      makeEvent({
        id: 'masked',
        masked: true,
        title: 'Busy',
        color: null,
        location: null,
        description: null,
      }),
    ]
    renderView({ events })

    const mapped = props().events
    expect(mapped).toHaveLength(2)
    expect(mapped[0]?.locked).toBe(true)
    expect(mapped[1]?.locked).toBe(true)
  })

  it('maps a masked event with no location/description and the fallback color, without re-deriving detail', () => {
    const events = [
      makeEvent({
        id: 'masked',
        masked: true,
        title: 'Busy',
        color: null,
        location: null,
        description: null,
      }),
    ]
    renderView({ events })

    const [mapped] = props().events
    expect(mapped?.title).toBe('Busy')
    expect(mapped?.color).toBe('default')
    expect(mapped?.location).toBeUndefined()
    expect(mapped?.description).toBeUndefined()
  })

  it('passes through non-null color/location/description for an unmasked event unchanged', () => {
    const events = [
      makeEvent({
        id: 'unmasked',
        masked: false,
        title: 'Morning Run',
        color: 'blue',
        location: 'Park',
        description: 'Loop the park',
      }),
    ]
    renderView({ events })

    const [mapped] = props().events
    expect(mapped?.title).toBe('Morning Run')
    expect(mapped?.color).toBe('blue')
    expect(mapped?.location).toBe('Park')
    expect(mapped?.description).toBe('Loop the park')
  })

  it('falls back an unmasked event with a null color to "default"', () => {
    const events = [makeEvent({ id: 'unmasked', masked: false, color: null })]
    renderView({ events })

    expect(props().events[0]?.color).toBe('default')
  })

  // Read-only trap regression (AGENTS.md WeekCalendarView/resyncToken + chip
  // gates): locked:true with ZERO mutation handlers wired is what makes every
  // chip fully inert (no resize handles, no drag-create/move, and — because
  // the lock icon only renders when onToggleLock is wired — no lock icon
  // either). Wiring even one of these back in would reopen mutation on a
  // profile that must stay read-only.
  it('wires no mutation handlers on WeekCalendarView', () => {
    renderView()

    const forbiddenKeys = [
      'onEventCreate',
      'onEventEdit',
      'onEventDelete',
      'onEventMove',
      'onEventResize',
      'onEventToggleLock',
      'onEventClick',
      'onEventRestore',
      'onEventToggleComplete',
    ]
    for (const key of forbiddenKeys) {
      expect(Object.keys(props())).not.toContain(key)
    }
  })

  it('defaults to the windowed view using the viewer wake/sleep hours', () => {
    renderView({ wakeHour: 9, sleepHour: 17 })

    expect(props().sleepEnabled).toBe(false)
    expect(props().hourStart).toBe(9)
    expect(props().hourCount).toBe(8)
    expect(props().defaultWeekStart).toBe('2026-06-01')
  })

  it('forwards sleepStart/sleepEnd and dayWindows unchanged in the windowed default', () => {
    renderView({ wakeHour: 9, sleepHour: 17, dayWindows: DAY_WINDOWS })

    expect(props().sleepStart).toBe(17)
    expect(props().sleepEnd).toBe(9)
    expect(props().dayWindows).toBe(DAY_WINDOWS)
  })

  it('clicking SleepToggle flips to full-day view (hourStart=0, hourCount=24, sleepEnabled=true)', async () => {
    const user = userEvent.setup()
    renderView({ wakeHour: 9, sleepHour: 17 })

    await user.click(screen.getByRole('button', { name: 'sleep-toggle' }))

    expect(props().sleepEnabled).toBe(true)
    expect(props().hourStart).toBe(0)
    expect(props().hourCount).toBe(24)
  })

  it('toggling back to windowed restores wakeHour/sleepHour-derived props', async () => {
    const user = userEvent.setup()
    renderView({ wakeHour: 9, sleepHour: 17 })

    await user.click(screen.getByRole('button', { name: 'sleep-toggle' }))
    await user.click(screen.getByRole('button', { name: 'sleep-toggle' }))

    expect(props().sleepEnabled).toBe(false)
    expect(props().hourStart).toBe(9)
    expect(props().hourCount).toBe(8)
  })

  it('calls router.replace with the new ?week= value and scroll:false, preserving an unrelated existing param', async () => {
    currentParams = new URLSearchParams('foo=bar')
    renderView()

    props().onWeekChange?.('2026-06-08')

    expect(replaceMock).toHaveBeenCalledWith('/u/ada?foo=bar&week=2026-06-08', { scroll: false })
  })
})
