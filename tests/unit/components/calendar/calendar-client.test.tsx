import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { CalendarClient } from '@/components/calendar/calendar-client'

// Radix Select relies on pointer-capture + scrollIntoView DOM APIs happy-dom
// does not implement; stub them so the Repeat select can be driven in tests
// (mirrors event-form-dialog.test.tsx).
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})

const mockCreateEvent = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'new-evt' } }))
const mockUpdateEvent = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'e1' } }))
const mockDeleteEvent = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { success: true } }))
const mockCreateActivity = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'act-new' } }))
const mockUpdateActivity = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'act-1' } }))
const mockCreateSeries = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'series-1' } }))
const mockToastError = vi.hoisted(() => vi.fn())
const mockRefresh = vi.hoisted(() => vi.fn())
const mockReplace = vi.hoisted(() => vi.fn())
const mockPush = vi.hoisted(() => vi.fn())
const mountCount = vi.hoisted(() => ({ value: 0 }))

const DAY_WINDOWS = Array.from({ length: 7 }, () => ({ wake: 9, sleep: 17 }))

vi.mock('@/server/actions/events', () => ({
  createEvent: mockCreateEvent,
  updateEvent: mockUpdateEvent,
  deleteEvent: mockDeleteEvent,
}))
vi.mock('@/server/actions/activities', () => ({
  createActivity: mockCreateActivity,
  updateActivity: mockUpdateActivity,
}))
vi.mock('@/server/actions/series', () => ({
  createSeries: mockCreateSeries,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: mockReplace, push: mockPush }),
}))

let capturedProps: Record<string, unknown> = {}
vi.mock('@/lib/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ui')>()),
  toast: { error: mockToastError },
  WeekCalendarView: (props: Record<string, unknown>) => {
    capturedProps = props
    const events = props.events as Array<{ id: string; title: string }>
    React.useEffect(() => {
      mountCount.value += 1
    }, [])
    return (
      <div>
        {events.map((e) => (
          <button key={e.id}>{e.title}</button>
        ))}
      </div>
    )
  },
}))

const events = [
  {
    id: 'e1',
    title: 'Morning run',
    start: '2026-05-29T07:00:00.000Z',
    end: '2026-05-29T08:00:00.000Z',
    color: null,
    allDay: false,
    location: 'Park',
    description: 'cardio',
    status: 'pending' as const,
    activityId: 'act-1',
  },
  {
    id: 'e2',
    title: 'Done event',
    start: '2026-05-29T09:00:00.000Z',
    end: '2026-05-29T10:00:00.000Z',
    color: 'violet',
    status: 'completed' as const,
    activityId: null,
  },
  {
    id: 'e3',
    title: 'Locked event',
    start: '2026-05-29T11:00:00.000Z',
    end: '2026-05-29T12:00:00.000Z',
    status: 'pending' as const,
    locked: true,
    activityId: null,
  },
]

const activities = [
  {
    id: 'act-1',
    title: 'Running',
    color: 'blue',
    description: 'cardio',
    defaultLocation: 'Park',
    minDurationMin: 30,
    maxDurationMin: 60,
    weeklyTargetSessions: 3,
    schedule: [{ day: 1, startMinutes: 420, durationMin: 45 }],
    timeZone: 'America/New_York',
  },
]

function renderClient(use24h = false): void {
  render(
    <CalendarClient
      weekStart="2026-05-25"
      events={events}
      activities={activities}
      wakeHour={9}
      sleepHour={17}
      dayWindows={DAY_WINDOWS}
      use24h={use24h}
    />,
  )
}

describe('CalendarClient (unit tree)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateEvent.mockResolvedValue({ data: { id: 'new-evt' } })
    mockUpdateEvent.mockResolvedValue({ data: { id: 'e1' } })
    mockDeleteEvent.mockResolvedValue({ data: { success: true } })
    mockCreateActivity.mockResolvedValue({ data: { id: 'act-new' } })
    mockUpdateActivity.mockResolvedValue({ data: { id: 'act-1' } })
    mockCreateSeries.mockResolvedValue({ data: { id: 'series-1' } })
    capturedProps = {}
    mountCount.value = 0
  })

  it('renders the calendar and never wires onEventClick', () => {
    renderClient()
    expect(screen.getByText('Morning run')).toBeInTheDocument()
    expect(capturedProps.onEventClick).toBeUndefined()
  })

  it('does not pass onCreateActivityRequest to the library view (drag-create picker entry dropped)', () => {
    renderClient()
    expect(capturedProps.onCreateActivityRequest).toBeUndefined()
  })

  it('passes axe', async () => {
    const { container } = render(
      <CalendarClient
        weekStart="2026-05-25"
        events={events}
        activities={activities}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('maps status/lock/activityId onto library events', () => {
    renderClient()
    const libEvents = capturedProps.events as ReadonlyArray<{
      id: string
      completed?: boolean
      completable?: boolean
      locked?: boolean
      activityId?: string | null
      color?: string
    }>
    const run = libEvents.find((e) => e.id === 'e1')!
    const done = libEvents.find((e) => e.id === 'e2')!
    const locked = libEvents.find((e) => e.id === 'e3')!
    expect(run.completed).toBe(false)
    expect(run.completable).toBe(true)
    expect(run.activityId).toBe('act-1')
    expect(run.color).toBe('default')
    expect(done.completed).toBe(true)
    expect(done.color).toBe('violet')
    expect(done.activityId).toBeUndefined()
    expect(locked.locked).toBe(true)
  })

  it('builds createActivityOptions from the activities prop', () => {
    renderClient()
    const options = capturedProps.createActivityOptions as ReadonlyArray<{
      id: string
      label: string
      defaultDurationMin?: number
    }>
    expect(options).toEqual([
      { id: 'act-1', label: 'Running', color: 'blue', defaultDurationMin: 30 },
    ])
  })

  it('forwards dayWindows and use24h', () => {
    renderClient(true)
    expect(capturedProps.dayWindows).toEqual(DAY_WINDOWS)
    expect(capturedProps.use24h).toBe(true)
  })

  it('persists a move via updateEvent without remounting', async () => {
    renderClient()
    const initialMount = mountCount.value
    const onEventMove = capturedProps.onEventMove as (e: unknown) => void
    onEventMove({
      id: 'e1',
      title: 'Morning run',
      start: '2026-05-29T09:00:00.000Z',
      end: '2026-05-29T10:00:00.000Z',
    })
    await vi.waitFor(() =>
      expect(mockUpdateEvent).toHaveBeenCalledWith({
        id: 'e1',
        startAt: '2026-05-29T09:00:00.000Z',
        endAt: '2026-05-29T10:00:00.000Z',
      }),
    )
    expect(mockRefresh).toHaveBeenCalled()
    expect(mountCount.value).toBe(initialMount)
  })

  it('bumps the resync token in place on move settle (no remount)', async () => {
    renderClient()
    const initialMount = mountCount.value
    const initialToken = capturedProps.resyncToken as number
    ;(capturedProps.onEventMove as (e: unknown) => void)({
      id: 'e1',
      title: 'Morning run',
      start: '2026-05-29T09:00:00.000Z',
      end: '2026-05-29T10:00:00.000Z',
    })
    await vi.waitFor(() => expect(capturedProps.resyncToken).toBe(initialToken + 1))
    expect(mountCount.value).toBe(initialMount)
  })

  it('creates exactly one event on a drag-create submission', async () => {
    renderClient()
    ;(capturedProps.onEventCreate as (e: unknown) => void)({
      title: 'Drawn',
      start: '2026-05-29T13:00:00.000Z',
      end: '2026-05-29T14:00:00.000Z',
      activityId: 'act-1',
    })
    await vi.waitFor(() => expect(mockCreateEvent).toHaveBeenCalledTimes(1))
    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Drawn', activityId: 'act-1' }),
    )
  })

  it('toggles completion via updateEvent status', async () => {
    renderClient()
    ;(capturedProps.onEventToggleComplete as (e: unknown) => void)({ id: 'e1', completed: true })
    await vi.waitFor(() =>
      expect(mockUpdateEvent).toHaveBeenCalledWith({ id: 'e1', status: 'completed' }),
    )
  })

  it('flips the persisted lock via updateEvent', async () => {
    renderClient()
    ;(capturedProps.onEventToggleLock as (e: unknown) => void)({ id: 'e3' })
    await vi.waitFor(() =>
      expect(mockUpdateEvent).toHaveBeenCalledWith({ id: 'e3', locked: false }),
    )
  })

  it('deletes via the confirm dialog', async () => {
    renderClient()
    ;(capturedProps.onEventDelete as (e: unknown) => void)({ id: 'e1', title: 'Morning run' })
    expect(await screen.findByText(/delete "Morning run"/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await vi.waitFor(() => expect(mockDeleteEvent).toHaveBeenCalledWith({ id: 'e1' }))
    expect(mountCount.value).toBe(mountCount.value)
  })

  it('opens the edit dialog and persists the finished edit via updateEvent', async () => {
    renderClient()
    ;(capturedProps.onEventEdit as (e: unknown) => void)({
      id: 'e1',
      title: 'Morning run',
      start: '2026-05-29T07:00:00.000Z',
      end: '2026-05-29T08:00:00.000Z',
    })
    // The real library EventFormDialog renders its own form.
    const titleInput = await screen.findByLabelText('Title')
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Evening run')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await vi.waitFor(() =>
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'e1', title: 'Evening run' }),
      ),
    )
  })

  it('opens the in-calendar activity template dialog on edit-activity (no navigation)', async () => {
    renderClient()
    ;(capturedProps.onEventEditActivity as (e: unknown) => void)({ id: 'e1', activityId: 'act-1' })
    // The real @/lib/ui ActivityTemplateDialog renders its own dialog, seeded
    // from the threaded activity (title input shows "Running").
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Running')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('opens an empty real ActivityTemplateDialog on New activity and creates via createActivity', async () => {
    renderClient()
    await userEvent.click(screen.getByRole('button', { name: 'New activity' }))

    expect(await screen.findByRole('dialog', { name: 'New activity template' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('')

    await userEvent.type(screen.getByLabelText('Title'), 'Yoga')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await vi.waitFor(() =>
      expect(mockCreateActivity).toHaveBeenCalledWith(expect.objectContaining({ title: 'Yoga' })),
    )
    expect(mockRefresh).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens a real EventFormDialog on New event, empty and ready for a standalone create', async () => {
    renderClient()
    await userEvent.click(screen.getByRole('button', { name: 'New event' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Title')).toHaveValue('')

    await userEvent.type(within(dialog).getByLabelText('Title'), 'Standup')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await vi.waitFor(() =>
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Standup', activityId: null }),
      ),
    )
    expect(mockRefresh).toHaveBeenCalled()
    // Absent recurrence → the createEvent path is byte-unchanged.
    expect(mockCreateSeries).not.toHaveBeenCalled()
  })

  it('routes a recurring New event submit to createSeries via the real Repeat control', async () => {
    // Pinned mid-morning (not near a local day boundary) so nextFullHourRange's
    // start/end stay on the same local day — `shouldAdvanceTime` keeps
    // userEvent's internal timers (pointer/click delays) running for real.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-01-06T14:22:00.000Z'))
    renderClient()

    await userEvent.click(screen.getByRole('button', { name: 'New event' }))
    const dialog = await screen.findByRole('dialog')

    await userEvent.type(within(dialog).getByLabelText('Title'), 'Standup')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Repeat' }))
    const listbox = await screen.findByRole('listbox')
    await userEvent.click(within(listbox).getByText('Daily'))
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

    // System time 14:22Z is 09:22 local (America/New_York, EST) → next full
    // hour local 10:00 → 600 minutes, 1h duration (nextFullHourRange).
    await vi.waitFor(() => expect(mockCreateSeries).toHaveBeenCalledTimes(1))
    expect(mockCreateSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Standup',
        activityId: null,
        freq: 'daily',
        startMinutes: 600,
        durationMin: 60,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        anchorStartAt: '2026-01-06T15:00:00.000Z',
        until: null,
      }),
    )
    expect(mockCreateEvent).not.toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('wires onEventDuplicate to set a createRequest seeded from the event', async () => {
    renderClient()
    expect(capturedProps.createRequest ?? null).toBeNull()
    ;(capturedProps.onEventDuplicate as (e: unknown) => void)({
      id: 'e1',
      title: 'Morning run',
      start: '2026-05-29T07:00:00.000Z',
      end: '2026-05-29T08:00:00.000Z',
      color: 'blue',
      location: 'Park',
      description: 'cardio',
      activityId: 'act-1',
    })
    await vi.waitFor(() => {
      const cr = capturedProps.createRequest as {
        slot: { start: string; end: string }
        activityId: string | null
        draft: { title: string; color?: string; location?: string; description?: string }
      }
      expect(cr.slot.start).toBe('2026-05-29T07:00:00.000Z')
      expect(cr.slot.end).toBe('2026-05-29T08:00:00.000Z')
      expect(cr.activityId).toBe('act-1')
      expect(cr.draft.title).toBe('Morning run')
      expect(cr.draft.color).toBe('blue')
    })
    // Duplicate does not itself write or refresh.
    expect(mockCreateEvent).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('clears createRequest and refreshes on dismiss', async () => {
    renderClient()
    ;(capturedProps.onEventDuplicate as (e: unknown) => void)({
      id: 'e1',
      title: 'Morning run',
      start: '2026-05-29T07:00:00.000Z',
      end: '2026-05-29T08:00:00.000Z',
    })
    await vi.waitFor(() => expect(capturedProps.createRequest ?? null).not.toBeNull())
    ;(capturedProps.onCreateRequestDismiss as () => void)()
    await vi.waitFor(() => expect(capturedProps.createRequest ?? null).toBeNull())
    expect(mockRefresh).toHaveBeenCalled()
  })
})
