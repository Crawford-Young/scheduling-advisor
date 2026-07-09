import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CalendarClient } from './calendar-client'

// ── shared mock functions ──────────────────────────────────────────────────

const refreshMock = vi.fn()
const replaceMock = vi.fn()
const createTaskMock = vi.fn()
const deleteTaskMock = vi.fn()
const rescheduleTaskMock = vi.fn()
const recordCompletionMock = vi.fn()
const updateTaskMock = vi.fn()
const updateTaskSeriesMock = vi.fn()
const toastErrorMock = vi.fn()

// AlertDialog stores a wrapper around its onOpenChange here so the Cancel and
// Action stubs can invoke it — mirroring Radix, which fires onOpenChange(false)
// whenever the dialog closes (via Cancel, via Action, or via Escape/overlay).
let capturedOnOpenChange: ((open: boolean) => void) | undefined

// Observes every onOpenChange(open) the dialog fires, so tests can assert that
// real-Radix close semantics (onOpenChange(false) on ANY close — cancel OR
// confirm) actually ran and thus exercised handleDeleteOpenChange.
const onOpenChangeSpy = vi.fn<(open: boolean) => void>()

// ── module mocks ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, replace: replaceMock }),
}))

vi.mock('@/server/actions/tasks', () => ({
  createTask: (input: unknown) => createTaskMock(input),
  deleteTask: (input: unknown) => deleteTaskMock(input),
  updateTask: (input: unknown) => updateTaskMock(input),
  updateTaskSeries: (input: unknown) => updateTaskSeriesMock(input),
}))

vi.mock('@/server/actions/consistency', () => ({
  rescheduleTask: (input: unknown) => rescheduleTaskMock(input),
  recordCompletion: (input: unknown) => recordCompletionMock(input),
}))

// ── @/lib/ui mock ──────────────────────────────────────────────────────────

interface MockLibEvent {
  readonly id: string
  readonly title: string
  readonly start: string
  readonly end: string
  readonly color?: string
  readonly location?: string
  readonly description?: string
  readonly allDay?: boolean
  readonly recurrenceFrequency?: string
  readonly recurrenceDays?: readonly string[]
  readonly seriesDays?: readonly string[]
  readonly recurrenceCount?: number
  readonly completed?: boolean
  readonly completable?: boolean
  readonly streak?: number
  readonly locked?: boolean
}

interface MockDayWindow {
  readonly wake: number
  readonly sleep: number
}

interface MockCreatePayload {
  readonly title: string
  readonly start: string
  readonly end: string
  readonly allDay?: boolean
  readonly color?: string
  readonly location?: string
  readonly description?: string
  readonly recurrenceFrequency?: string
  readonly recurrenceDays?: readonly string[]
  readonly recurrenceCount?: number
}

interface WeekCalendarViewProps {
  readonly defaultWeekStart?: string
  readonly events?: ReadonlyArray<MockLibEvent>
  readonly onEventMove?: (e: MockLibEvent) => void
  readonly onEventResize?: (e: MockLibEvent) => void
  readonly onEventDelete?: (e: MockLibEvent) => void
  readonly onEventEdit?: (e: MockLibEvent) => void
  readonly onEventCreate?: (e: MockCreatePayload) => void
  readonly onEventToggleComplete?: (e: MockLibEvent) => void
  readonly onEventToggleLock?: (e: MockLibEvent) => void
  readonly onWeekChange?: (weekStart: string) => void
  readonly resyncToken?: string | number
  readonly hourStart?: number
  readonly hourCount?: number
  readonly sleepEnabled?: boolean
  readonly sleepStart?: number
  readonly sleepEnd?: number
  readonly dayWindows?: readonly MockDayWindow[]
  readonly use24h?: boolean
}

// id matches EVENTS[0].id (a pending, non-completed row).
const STUB_LIB_EVENT: MockLibEvent = {
  id: 'evt-1',
  title: 'Test event',
  start: '2026-01-06T09:00:00.000Z',
  end: '2026-01-06T10:00:00.000Z',
  color: 'blue',
}

// The FINISHED edit the library chip popover emits after Save (already applied
// optimistically inside WeekCalendarView). handleEventEdit must persist it.
const STUB_EDIT_PAYLOAD: MockLibEvent = {
  id: 'evt-1',
  title: 'Edited title',
  start: '2026-01-06T09:30:00.000Z',
  end: '2026-01-06T10:30:00.000Z',
  color: 'violet',
  location: 'Gym',
  description: 'leg day',
  recurrenceFrequency: 'weekly',
}

// Completed event (id matches the completed EVENTS fixture) — edits are allowed
// like any other event; only a manual lock gates move/resize.
const STUB_COMPLETED_LIB_EVENT: MockLibEvent = {
  id: 'evt-done',
  title: 'Done event',
  start: '2026-01-06T09:00:00.000Z',
  end: '2026-01-06T10:00:00.000Z',
}

// Series-shaped chip edit: the user picked a weekday set in the chip popover, so
// recurrenceDays reaches onEventEdit. evt-1 is already a weekly series → this
// must route to updateTaskSeries (regenerate the group), NOT updateTask.
const STUB_SERIES_EDIT_PAYLOAD: MockLibEvent = {
  id: 'evt-1',
  title: 'Test event',
  start: '2026-01-06T09:00:00.000Z',
  end: '2026-01-06T10:00:00.000Z',
  recurrenceFrequency: 'weekly',
  recurrenceDays: ['Mon', 'Wed'],
}

// Multi-day weekly drag-create payload: recurrenceDays must reach createTask.
const STUB_CREATE_PAYLOAD: MockCreatePayload = {
  title: 'test',
  start: '2026-01-05T09:00:00.000Z',
  end: '2026-01-06T10:00:00.000Z',
  allDay: true,
  color: 'violet',
  location: 'Gym',
  description: 'leg day',
  recurrenceFrequency: 'weekly',
  recurrenceDays: ['Mon', 'Tue'],
}

vi.mock('@/lib/ui', () => ({
  WeekCalendarView: (props: WeekCalendarViewProps) => (
    <div
      data-testid="week-calendar-view"
      data-hour-start={props.hourStart !== undefined ? String(props.hourStart) : undefined}
      data-hour-count={props.hourCount !== undefined ? String(props.hourCount) : undefined}
      data-sleep-enabled={props.sleepEnabled !== undefined ? String(props.sleepEnabled) : undefined}
      data-sleep-start={props.sleepStart !== undefined ? String(props.sleepStart) : undefined}
      data-sleep-end={props.sleepEnd !== undefined ? String(props.sleepEnd) : undefined}
      data-has-event-click={String('onEventClick' in props)}
      // Round-tripped recurrenceFrequency for the first event (mapping assertion).
      data-evt0-recurrence={props.events?.[0]?.recurrenceFrequency ?? ''}
      data-evt0-has-recurrence-days={String(props.events?.[0]?.recurrenceDays !== undefined)}
      // S9: seriesDays seeds the chip edit popover's Days picker from the row's
      // persisted recurrenceDays WITHOUT triggering WeekCalendarView display
      // fan-out (the library's own recurrenceDays field must stay undefined).
      data-evt-series-series-days={(
        props.events?.find((e) => e.id === 'evt-series')?.seriesDays ?? []
      ).join(',')}
      data-evt-series-has-recurrence-days={String(
        props.events?.find((e) => e.id === 'evt-series')?.recurrenceDays !== undefined,
      )}
      // A8.11: persisted null color must map to the library's 'default'
      // variant, and allDay/location/description must be forwarded.
      data-evt0-color={props.events?.[0]?.color ?? ''}
      data-evt0-all-day={String(props.events?.[0]?.allDay ?? '')}
      data-evt0-location={props.events?.[0]?.location ?? ''}
      data-evt0-description={props.events?.[0]?.description ?? ''}
      // A persisted, truthy color (evt-done) must pass through unchanged.
      data-evt1-color={props.events?.[1]?.color ?? ''}
      // A9: 24h format + per-day windows threaded from prefs, and the 0.17.0
      // completion contract (completed/completable/streak) mapped onto chips.
      data-use24h={String(props.use24h ?? '')}
      data-day-windows-length={String(props.dayWindows?.length ?? '')}
      data-day-windows-wake0={String(props.dayWindows?.[0]?.wake ?? '')}
      data-evt0-completed={String(props.events?.[0]?.completed ?? '')}
      data-evt0-completable={String(props.events?.[0]?.completable ?? '')}
      data-evt0-streak={String(props.events?.[0]?.streak ?? '')}
      data-evt1-completed={String(props.events?.[1]?.completed ?? '')}
      // A2.4: the persisted locked flag seeds the library event. An unlocked row
      // seeds undefined; the locked fixture seeds true.
      data-evt0-locked={String(props.events?.[0]?.locked ?? '')}
      data-evt-locked={String(props.events?.find((e) => e.id === 'evt-locked')?.locked ?? '')}
      // A2 (2.5): resyncToken re-seeds the library from the events prop WITHOUT
      // remounting. Every server-mutating success path bumps it after the
      // router.refresh transition settles; guard/cancel paths bump it immediately.
      data-resync-token={String(props.resyncToken ?? '')}
    >
      <button type="button" onClick={() => props.onEventDelete?.(STUB_LIB_EVENT)}>
        trigger-delete
      </button>
      <button type="button" onClick={() => props.onEventMove?.(STUB_LIB_EVENT)}>
        trigger-move
      </button>
      <button type="button" onClick={() => props.onEventResize?.(STUB_LIB_EVENT)}>
        trigger-resize
      </button>
      <button type="button" onClick={() => props.onEventCreate?.(STUB_CREATE_PAYLOAD)}>
        trigger-create
      </button>
      {/* Minimal payload: only title/start/end — exercises the ?? fallback branches. */}
      <button
        type="button"
        onClick={() =>
          props.onEventCreate?.({
            title: 'y',
            start: '2026-01-06T09:00:00.000Z',
            end: '2026-01-06T10:00:00.000Z',
          })
        }
      >
        trigger-create-min
      </button>
      {/* S9: the create popover's repeat count must reach createTask so a weekly
          drag-create fans the pattern over N weeks. */}
      <button
        type="button"
        onClick={() =>
          props.onEventCreate?.({
            title: 'counted',
            start: '2026-01-05T09:00:00.000Z',
            end: '2026-01-05T10:00:00.000Z',
            recurrenceFrequency: 'weekly',
            recurrenceDays: ['Mon', 'Tue'],
            recurrenceCount: 3,
          })
        }
      >
        trigger-create-count
      </button>
      <button type="button" onClick={() => props.onEventEdit?.(STUB_EDIT_PAYLOAD)}>
        trigger-edit
      </button>
      {/* Minimal edit payload: no color/location/description/recurrence/allDay. */}
      <button
        type="button"
        onClick={() =>
          props.onEventEdit?.({
            id: 'evt-1',
            title: 'Edited title',
            start: '2026-01-06T09:30:00.000Z',
            end: '2026-01-06T10:30:00.000Z',
          })
        }
      >
        trigger-edit-min
      </button>
      <button type="button" onClick={() => props.onEventEdit?.(STUB_COMPLETED_LIB_EVENT)}>
        trigger-edit-completed
      </button>
      <button type="button" onClick={() => props.onEventEdit?.(STUB_SERIES_EDIT_PAYLOAD)}>
        trigger-edit-series-days
      </button>
      {/* S9: evt-series persists recurrenceDays ['Mon','Wed']. The seeded picker
          re-emits the SAME set (reordered) alongside a time change → order-
          insensitive set equality must keep this on updateTask (preserve the
          time change), NOT misroute to updateTaskSeries. */}
      <button
        type="button"
        onClick={() =>
          props.onEventEdit?.({
            id: 'evt-series',
            title: 'Series',
            start: '2026-01-06T15:30:00.000Z',
            end: '2026-01-06T16:30:00.000Z',
            recurrenceFrequency: 'weekly',
            recurrenceDays: ['Wed', 'Mon'],
          })
        }
      >
        trigger-edit-series-same-days
      </button>
      {/* S9: the user changes the seeded set (['Mon','Wed'] → ['Mon','Fri']) →
          a real pattern change routes to updateTaskSeries with the new tokens. */}
      <button
        type="button"
        onClick={() =>
          props.onEventEdit?.({
            id: 'evt-series',
            title: 'Series',
            start: '2026-01-06T15:00:00.000Z',
            end: '2026-01-06T16:00:00.000Z',
            recurrenceFrequency: 'weekly',
            recurrenceDays: ['Mon', 'Fri'],
          })
        }
      >
        trigger-edit-series-changed-days
      </button>
      <button
        type="button"
        onClick={() =>
          props.onEventEdit?.({
            id: 'evt-1',
            title: 'Test event',
            start: '2026-01-06T09:00:00.000Z',
            end: '2026-01-06T10:00:00.000Z',
            recurrenceFrequency: 'daily',
          })
        }
      >
        trigger-edit-freq-change
      </button>
      {/* S10: a NON-recurring event (evt-oneoff) gains a frequency in the chip
          popover → must route to updateTaskSeries to materialize the series. */}
      <button
        type="button"
        onClick={() =>
          props.onEventEdit?.({
            id: 'evt-oneoff',
            title: 'One off',
            start: '2026-01-06T11:00:00.000Z',
            end: '2026-01-06T12:00:00.000Z',
            recurrenceFrequency: 'weekly',
          })
        }
      >
        trigger-edit-make-recurring
      </button>
      {/* Review fix: a GOAL (evt-goal) edited with a series frequency must NEVER
          route to updateTaskSeries — goals never materialize into a series. */}
      <button
        type="button"
        onClick={() =>
          props.onEventEdit?.({
            id: 'evt-goal',
            title: 'Read a book',
            start: '2026-01-06T13:00:00.000Z',
            end: '2026-01-06T14:00:00.000Z',
            recurrenceFrequency: 'weekly',
          })
        }
      >
        trigger-edit-goal-recurrence
      </button>
      {/* Recurring event (evt-1 has recurrence 'weekly') → recordCompletion.
          Library hands off the TOGGLED event (completed: true = user wants
          it completed now) — see WeekCalendarView.handleEventToggleComplete. */}
      <button
        type="button"
        onClick={() => props.onEventToggleComplete?.({ ...STUB_LIB_EVENT, completed: true })}
      >
        trigger-toggle-recurring
      </button>
      {/* Un-complete direction: completed: false = user wants it un-completed. */}
      <button
        type="button"
        onClick={() => props.onEventToggleComplete?.({ ...STUB_LIB_EVENT, completed: false })}
      >
        trigger-toggle-recurring-uncomplete
      </button>
      {/* Non-recurring event (evt-done has no recurrence) → updateTask status. */}
      <button
        type="button"
        onClick={() =>
          props.onEventToggleComplete?.({ ...STUB_COMPLETED_LIB_EVENT, completed: true })
        }
      >
        trigger-toggle-nonrecurring
      </button>
      {/* Un-complete direction for a non-recurring event. */}
      <button
        type="button"
        onClick={() =>
          props.onEventToggleComplete?.({ ...STUB_COMPLETED_LIB_EVENT, completed: false })
        }
      >
        trigger-toggle-nonrecurring-uncomplete
      </button>
      {/* A2.4: lock an unlocked row (evt-1). The app flips server truth, so the
          payload the passed event carries is irrelevant. */}
      <button type="button" onClick={() => props.onEventToggleLock?.({ ...STUB_LIB_EVENT })}>
        trigger-toggle-lock
      </button>
      {/* A2.4: unlock the already-locked fixture (evt-locked). */}
      <button
        type="button"
        onClick={() => props.onEventToggleLock?.({ ...STUB_LIB_EVENT, id: 'evt-locked' })}
      >
        trigger-toggle-unlock
      </button>
      {/* A2 (2.5): library week navigation emits the new week's Sunday-ISO. */}
      <button type="button" onClick={() => props.onWeekChange?.('2026-06-07')}>
        trigger-week-change
      </button>
    </div>
  ),
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
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
  AlertDialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange?: (open: boolean) => void
    children: React.ReactNode
  }) => {
    // Wrap so every close request is observable (onOpenChangeSpy) AND forwarded
    // to the real handler. Cancel and Action both drive this — see below.
    capturedOnOpenChange = (next: boolean) => {
      onOpenChangeSpy(next)
      onOpenChange?.(next)
    }
    return open ? <div role="alertdialog">{children}</div> : null
  },
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  // Radix AlertDialogCancel closes the dialog → fires onOpenChange(false).
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button type="button" onClick={() => capturedOnOpenChange?.(false)}>
      {children}
    </button>
  ),
  // Radix AlertDialogAction runs its onClick AND closes the dialog, so a
  // confirmed delete ALSO fires onOpenChange(false) afterward — this is exactly
  // what handleDeleteOpenChange's confirmedRef guard exists to neutralize.
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
  }) => (
    <button
      type="button"
      onClick={(e) => {
        onClick?.(e)
        capturedOnOpenChange?.(false)
      }}
    >
      {children}
    </button>
  ),
}))

// ── test fixtures ──────────────────────────────────────────────────────────

const WEEK_START = '2026-01-06'

// Per-day awake windows in fractional hours, Sun-first (7 entries) — the shape
// page.tsx builds from prefs (minutes ÷ 60) and threads through CalendarClient.
const DAY_WINDOWS = Array.from({ length: 7 }, () => ({ wake: 9, sleep: 17 }))

const EVENTS = [
  {
    id: 'evt-1',
    title: 'Test event',
    start: '2026-01-06T09:00:00.000Z',
    end: '2026-01-06T10:00:00.000Z',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 5,
    activityType: 'solo',
    visibility: 'only_me',
    recurrence: 'weekly',
    // Persisted null color (A8.11): the default popover swatch persists as
    // null, and must map to the library's literal 'default' variant — NOT
    // the stale type-based blue/amber fallback.
    color: null,
    allDay: true,
    location: 'Gym',
    description: 'leg day',
  },
  {
    id: 'evt-done',
    title: 'Done event',
    start: '2026-01-06T09:00:00.000Z',
    end: '2026-01-06T10:00:00.000Z',
    type: 'task' as const,
    status: 'completed' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
    // Persisted, truthy user-chosen color must pass through unchanged.
    color: 'violet',
  },
  // A pending, NON-recurring event — the S10 make-recurring routing fixture.
  {
    id: 'evt-oneoff',
    title: 'One off',
    start: '2026-01-06T11:00:00.000Z',
    end: '2026-01-06T12:00:00.000Z',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
    recurrence: null,
  },
  // A goal (never a series) — the S10 review-fix goal-exclusion fixture.
  {
    id: 'evt-goal',
    title: 'Read a book',
    start: '2026-01-06T13:00:00.000Z',
    end: '2026-01-06T14:00:00.000Z',
    type: 'goal' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
    recurrence: null,
  },
  // S9: a weekly series row carrying a persisted weekday set — seeds the chip
  // popover's Days picker (via seriesDays) and drives set-equality routing.
  {
    id: 'evt-series',
    title: 'Series',
    start: '2026-01-06T15:00:00.000Z',
    end: '2026-01-06T16:00:00.000Z',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
    recurrence: 'weekly',
    recurrenceDays: ['Mon', 'Wed'] as const,
  },
  // A2.4: a row pinned in place — seeds locked:true onto the library event and
  // the lock toggle should flip it to unlocked.
  {
    id: 'evt-locked',
    title: 'Locked event',
    start: '2026-01-06T20:00:00.000Z',
    end: '2026-01-06T21:00:00.000Z',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
    locked: true,
  },
]

// ── resync machinery ────────────────────────────────────────────────────────
//
// These tests pin the resync behavior of CalendarClient (Wave 2.5):
//   • WeekCalendarView never remounts — `resyncToken` re-seeds it from the
//     events prop in place (stable DOM node; NO `key` bump).
//   • Server-mutating SUCCESS paths (move/resize/edit/complete/lock/delete-
//     confirm/create) → router.refresh, then a token bump once the refresh
//     transition settles (the new events prop has arrived).
//   • Error paths → toast.error + the same refresh-then-settle-bump.
//   • Guard/cancel paths that make no server call (delete-cancel) → an
//     IMMEDIATE token bump and NO router.refresh (props already hold server
//     truth). Completed events are NOT a guard path — only a manual lock
//     gates move/resize, and edits are always allowed.
//   • Successful delete → confirmedRef keeps handleDeleteOpenChange from
//     firing a SECOND (immediate) bump on top of the confirm path's bump.

describe('CalendarClient — resync machinery', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    replaceMock.mockClear()
    deleteTaskMock.mockClear()
    deleteTaskMock.mockResolvedValue({})
    rescheduleTaskMock.mockClear()
    rescheduleTaskMock.mockResolvedValue({})
    toastErrorMock.mockClear()
    onOpenChangeSpy.mockClear()
    capturedOnOpenChange = undefined
  })

  it('failed delete bumps the resync token in place (no remount) and calls toast.error', async () => {
    deleteTaskMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const beforeNode = screen.getByTestId('week-calendar-view')
    expect(beforeNode.dataset.resyncToken).toBe('0')

    await user.click(screen.getByRole('button', { name: 'trigger-delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not delete event'))
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))

    // Same DOM node throughout — the library re-seeds via the token, never remounts.
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })

  it('successful delete bumps the token exactly once (confirmedRef guards a second bump)', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const beforeNode = screen.getByTestId('week-calendar-view')

    await user.click(screen.getByRole('button', { name: 'trigger-delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteTaskMock).toHaveBeenCalledWith({ id: 'evt-1' }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    // The confirm path refreshes then bumps once; the guarded onOpenChange(false)
    // must NOT add a second immediate bump, so the token settles at exactly 1.
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))

    expect(onOpenChangeSpy).toHaveBeenCalledWith(false)
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
  })

  it('cancelling the delete dialog bumps the token immediately with NO refresh', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const beforeNode = screen.getByTestId('week-calendar-view')

    await user.click(screen.getByRole('button', { name: 'trigger-delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    // No server call → props already hold truth → immediate resync, never a refresh.
    expect(refreshMock).not.toHaveBeenCalled()
    expect(deleteTaskMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
  })

  it('reschedule failure (move) bumps the token in place (no remount) and calls toast.error', async () => {
    rescheduleTaskMock.mockResolvedValueOnce({ error: 'Unauthorized' })
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const beforeNode = screen.getByTestId('week-calendar-view')

    await user.click(screen.getByRole('button', { name: 'trigger-move' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not reschedule — calendar restored'),
    )
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))

    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })

  it('a successful move refreshes then bumps the token in place (no remount)', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const beforeNode = screen.getByTestId('week-calendar-view')

    await user.click(screen.getByRole('button', { name: 'trigger-move' }))

    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('resize wires to the same reschedule path', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'trigger-resize' }))
    await waitFor(() => expect(rescheduleTaskMock).toHaveBeenCalled())
  })
})

// ── week URL sync (A2, Wave 2.5) ─────────────────────────────────────────────
//
// Library week navigation emits the new week's Sunday-ISO via onWeekChange. The
// app mirrors it into `?week=` with router.replace({scroll:false}), PRESERVING
// every other query param, so a reload re-seeds the same week. This is a plain
// URL write — no server call, no refresh, no token bump.

describe('CalendarClient — week URL sync (A2)', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    replaceMock.mockClear()
    window.history.replaceState({}, '', '/calendar')
  })

  it('onWeekChange writes ?week= via router.replace with scroll:false', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-week-change' }))

    expect(replaceMock).toHaveBeenCalledWith('?week=2026-06-07', { scroll: false })
    // A URL write only — never a data refetch or a resync token bump.
    expect(refreshMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('week-calendar-view').dataset.resyncToken).toBe('0')
  })

  it('preserves other query params when writing the week', async () => {
    window.history.replaceState({}, '', '/calendar?q=gym&view=grid')
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-week-change' }))

    expect(replaceMock).toHaveBeenCalledWith('?q=gym&view=grid&week=2026-06-07', { scroll: false })
  })

  it('overwrites an existing week param rather than appending a duplicate', async () => {
    window.history.replaceState({}, '', '/calendar?week=2026-01-06')
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-week-change' }))

    expect(replaceMock).toHaveBeenCalledWith('?week=2026-06-07', { scroll: false })
  })
})

// ── event-edit persistence (library popover owns the edit form) ─────────────
//
// The library chip popover contains its own edit form; onEventEdit delivers the
// FINISHED edit to persist. The app must NOT open a second dialog — it maps the
// updated library event to updateTask directly.

describe('CalendarClient — event edit persistence', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    updateTaskMock.mockClear()
    updateTaskMock.mockResolvedValue({})
    toastErrorMock.mockClear()
  })

  it('persists the finished chip-popover edit via updateTask (no app dialog opens)', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-edit' }))

    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith({
        id: 'evt-1',
        title: 'Edited title',
        startAt: '2026-01-06T09:30:00.000Z',
        endAt: '2026-01-06T10:30:00.000Z',
        color: 'violet',
        location: 'Gym',
        description: 'leg day',
        recurrence: 'weekly',
        allDay: false,
      }),
    )
    expect(refreshMock).toHaveBeenCalled()
    // No app-owned edit dialog — the library popover is the only edit UI.
    expect(screen.queryByTestId('activity-form-dialog')).not.toBeInTheDocument()
  })

  it('maps missing optional fields to null / allDay:false on edit', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-edit-min' }))

    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'evt-1',
          color: null,
          location: null,
          description: null,
          recurrence: null,
          allDay: false,
        }),
      ),
    )
  })

  it('persists an edit of a completed event via updateTask like any other event (no completed guard)', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-edit-completed' }))

    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'evt-done', title: 'Done event' }),
      ),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  it('surfaces a toast and resyncs in place when the edit fails to persist', async () => {
    updateTaskMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const beforeNode = screen.getByTestId('week-calendar-view')
    await user.click(screen.getByRole('button', { name: 'trigger-edit' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not save event — calendar restored'),
    )
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })

  it('round-trips the stored recurrence into recurrenceFrequency (no recurrenceDays)', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    const view = screen.getByTestId('week-calendar-view')
    // EVENTS[0].recurrence === 'weekly' → library recurrenceFrequency.
    expect(view.dataset.evt0Recurrence).toBe('weekly')
    // Fanned rows are standalone — recurrenceDays must stay undefined.
    expect(view.dataset.evt0HasRecurrenceDays).toBe('false')
  })
})

// ── series-shaped edit routing (S8) ─────────────────────────────────────────
//
// The chip popover can change the recurrence PATTERN (a weekday set or a changed
// frequency on an existing series) as well as row-shaped fields (time/title).
// A series-shaped change routes to updateTaskSeries, which regenerates the
// group's future pending rows; a plain time/field change keeps updateTask.

describe('CalendarClient — series-shaped edit routing (S8)', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    updateTaskMock.mockClear()
    updateTaskMock.mockResolvedValue({})
    updateTaskSeriesMock.mockClear()
    updateTaskSeriesMock.mockResolvedValue({})
    toastErrorMock.mockClear()
  })

  it('routes a chip edit with a changed weekday set to updateTaskSeries with the token array', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-edit-series-days' }))

    await waitFor(() =>
      expect(updateTaskSeriesMock).toHaveBeenCalledWith({
        taskId: 'evt-1',
        recurrence: 'weekly',
        recurrenceDays: ['Mon', 'Wed'],
      }),
    )
    // Series-shaped change owns the save — updateTask must NOT also fire.
    expect(updateTaskMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('routes a chip edit that changes only the frequency (no weekday set) to updateTaskSeries', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    // evt-1 is stored as 'weekly'; the popover switches it to 'daily' with no
    // weekday picker → a series-shaped frequency change, recurrenceDays undefined.
    await user.click(screen.getByRole('button', { name: 'trigger-edit-freq-change' }))

    await waitFor(() =>
      expect(updateTaskSeriesMock).toHaveBeenCalledWith({
        taskId: 'evt-1',
        recurrence: 'daily',
        recurrenceDays: undefined,
      }),
    )
    expect(updateTaskMock).not.toHaveBeenCalled()
  })

  it('routes a chip edit with only a time change to updateTask (not updateTaskSeries)', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    // STUB_EDIT_PAYLOAD keeps recurrenceFrequency 'weekly' (evt-1's stored value)
    // and carries no recurrenceDays → row-shaped edit.
    await user.click(screen.getByRole('button', { name: 'trigger-edit' }))

    await waitFor(() => expect(updateTaskMock).toHaveBeenCalled())
    expect(updateTaskSeriesMock).not.toHaveBeenCalled()
  })

  it('surfaces a toast and resyncs in place when a series edit fails to persist', async () => {
    updateTaskSeriesMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const beforeNode = screen.getByTestId('week-calendar-view')
    await user.click(screen.getByRole('button', { name: 'trigger-edit-series-days' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not save event — calendar restored'),
    )
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })
})

// ── make-recurring routing (S10) ────────────────────────────────────────────
//
// Setting a frequency on a NON-recurring event routes to updateTaskSeries, which
// materializes the series (updates the anchor in place + fans out future rows).
// Clearing recurrence on an already-recurring event stays on updateTask.

describe('CalendarClient — make-recurring routing (S10)', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    updateTaskMock.mockClear()
    updateTaskMock.mockResolvedValue({})
    updateTaskSeriesMock.mockClear()
    updateTaskSeriesMock.mockResolvedValue({})
    toastErrorMock.mockClear()
  })

  it('routes making a non-recurring event recurring to updateTaskSeries (not updateTask)', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-edit-make-recurring' }))

    await waitFor(() =>
      expect(updateTaskSeriesMock).toHaveBeenCalledWith({
        taskId: 'evt-oneoff',
        recurrence: 'weekly',
        recurrenceDays: undefined,
      }),
    )
    expect(updateTaskMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('keeps clearing recurrence on a recurring event on updateTask (series → one-off)', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    // evt-1 is stored 'weekly'; the minimal edit payload carries no
    // recurrenceFrequency → recurrence cleared → row-shaped updateTask.
    await user.click(screen.getByRole('button', { name: 'trigger-edit-min' }))

    await waitFor(() => expect(updateTaskMock).toHaveBeenCalled())
    expect(updateTaskSeriesMock).not.toHaveBeenCalled()
  })

  // Review fix: goals never materialize into a series — the pre-S10 wasRecurring
  // gate implicitly protected goals (never recurring → false → updateTask); the
  // !wasRecurring materialize arm must not remove that protection.
  it('never routes a goal edited with a series frequency to updateTaskSeries', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-edit-goal-recurrence' }))

    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'evt-goal', recurrence: 'weekly' }),
      ),
    )
    expect(updateTaskSeriesMock).not.toHaveBeenCalled()
  })
})

// ── seriesDays seeding + set-equality routing (S9 / 0.18.0) ─────────────────
//
// 0.18.0 seeds the chip edit popover's Days picker from `seriesDays` (decoupled
// from the display-fan-out `recurrenceDays`), so handleSave re-emits days on
// EVERY save. The routing predicate therefore switches from presence-based to
// order-insensitive SET EQUALITY against the row's persisted recurrenceDays:
// unchanged (even reordered) days keep updateTask (time change preserved); a
// changed set routes to updateTaskSeries.

describe('CalendarClient — seriesDays seeding + set-equality routing (S9)', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    updateTaskMock.mockClear()
    updateTaskMock.mockResolvedValue({})
    updateTaskSeriesMock.mockClear()
    updateTaskSeriesMock.mockResolvedValue({})
    toastErrorMock.mockClear()
  })

  it('seeds the persisted recurrenceDays onto the library seriesDays field (NOT recurrenceDays)', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    const view = screen.getByTestId('week-calendar-view')
    // seriesDays carries the persisted set (seeds the picker)...
    expect(view.dataset.evtSeriesSeriesDays).toBe('Mon,Wed')
    // ...but the display-fan-out recurrenceDays field stays undefined so the
    // already-materialized row does not double-render across the week.
    expect(view.dataset.evtSeriesHasRecurrenceDays).toBe('false')
  })

  it('keeps a time-only edit with the seeded days (reordered, same set) on updateTask', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-edit-series-same-days' }))

    // The re-emitted seeded set equals the persisted set (order-insensitive) →
    // the time change must be written via updateTask, not dropped by a series edit.
    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'evt-series',
          startAt: '2026-01-06T15:30:00.000Z',
          endAt: '2026-01-06T16:30:00.000Z',
        }),
      ),
    )
    expect(updateTaskSeriesMock).not.toHaveBeenCalled()
  })

  it('routes a genuinely changed weekday set to updateTaskSeries with the new tokens', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-edit-series-changed-days' }))

    await waitFor(() =>
      expect(updateTaskSeriesMock).toHaveBeenCalledWith({
        taskId: 'evt-series',
        recurrence: 'weekly',
        recurrenceDays: ['Mon', 'Fri'],
      }),
    )
    expect(updateTaskMock).not.toHaveBeenCalled()
  })
})

// ── color and detail field mapping (A8.11) ──────────────────────────────────
//
// A8.11: an event created via the calendar popover's default (pre-selected)
// swatch persists color:null. The library's own semantics for a missing color
// are the literal 'default' variant (emerald) — not a type-based blue/amber
// fallback, which flips the chip's color on the post-create remount/refresh.
// Sibling bug: allDay/location/description were dropped by the mapper, so
// they display optimistically then vanish after router.refresh().

describe('CalendarClient — color and detail field mapping (A8.11)', () => {
  it('maps a persisted null color to the library "default" variant, not a type-based blue/amber fallback', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    const view = screen.getByTestId('week-calendar-view')
    expect(view.dataset.evt0Color).toBe('default')
  })

  it('forwards allDay, location, and description to the library event', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    const view = screen.getByTestId('week-calendar-view')
    expect(view.dataset.evt0AllDay).toBe('true')
    expect(view.dataset.evt0Location).toBe('Gym')
    expect(view.dataset.evt0Description).toBe('leg day')
  })

  it('passes a persisted, truthy user-chosen color through unchanged', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    const view = screen.getByTestId('week-calendar-view')
    expect(view.dataset.evt1Color).toBe('violet')
  })
})

// ── event-create wiring ─────────────────────────────────────────────────────
//
// Dragging to create a slot calls createTask directly (library drag-create
// popover only — no app dialog) and uses the resync machinery.

describe('CalendarClient — event create wiring', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    createTaskMock.mockClear()
    createTaskMock.mockResolvedValue({})
    toastErrorMock.mockClear()
  })

  it('onEventCreate persists a task from the library payload including recurrenceDays', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-create' }))

    await waitFor(() =>
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task',
          title: 'test',
          startAt: expect.any(String),
          endAt: expect.any(String),
          allDay: true,
          color: 'violet',
          location: 'Gym',
          description: 'leg day',
          recurrence: 'weekly',
          // The multi-day drag's selected weekdays must reach createTask so the
          // server fan-out expands Monday AND Tuesday (bug #2 fix).
          recurrenceDays: ['Mon', 'Tue'],
        }),
      ),
    )
  })

  it('threads the create popover recurrenceCount through to createTask (weekly fan over N weeks)', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-create-count' }))

    await waitFor(() =>
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task',
          recurrence: 'weekly',
          recurrenceDays: ['Mon', 'Tue'],
          recurrenceCount: 3,
        }),
      ),
    )
  })

  it('onEventCreate with a minimal payload applies the null/false fallbacks', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-create-min' }))

    await waitFor(() =>
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task',
          allDay: false,
          color: null,
          location: null,
          description: null,
          recurrence: null,
          recurrenceDays: undefined,
        }),
      ),
    )
  })

  it('onEventCreate error surfaces toast.error', async () => {
    createTaskMock.mockResolvedValueOnce({ error: 'Too many requests' })
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-create' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not create event — calendar restored'),
    )
  })
})

// ── calendar uses library UI exclusively ────────────────────────────────────
//
// No app-owned "+ New" button and no ActivityFormDialog on the calendar —
// creation is the library drag-create popover, edit is the chip popover.

describe('CalendarClient — library-only calendar UI', () => {
  beforeEach(() => {
    createTaskMock.mockClear()
    updateTaskMock.mockClear()
  })

  it('renders no "+ New" button', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    expect(screen.queryByRole('button', { name: '+ New' })).not.toBeInTheDocument()
  })

  it('renders no app-owned activity dialog', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    expect(screen.queryByTestId('activity-form-dialog')).not.toBeInTheDocument()
  })
})

// ── wake/sleep window and SleepToggle ───────────────────────────────────────

describe('CalendarClient — wake/sleep window', () => {
  beforeEach(() => {
    refreshMock.mockClear()
  })

  it('passes windowed props (hourStart=9, hourCount=8, sleepEnabled=false, sleepStart=17, sleepEnd=9) by default', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const view = screen.getByTestId('week-calendar-view')
    expect(view.dataset.hourStart).toBe('9')
    expect(view.dataset.hourCount).toBe('8')
    expect(view.dataset.sleepEnabled).toBe('false')
    expect(view.dataset.sleepStart).toBe('17')
    expect(view.dataset.sleepEnd).toBe('9')
  })

  it('clicking SleepToggle flips to full-day view (hourStart=0, hourCount=24, sleepEnabled=true)', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'sleep-toggle' }))

    const view = screen.getByTestId('week-calendar-view')
    expect(view.dataset.hourStart).toBe('0')
    expect(view.dataset.hourCount).toBe('24')
    expect(view.dataset.sleepEnabled).toBe('true')
  })
})

// ── no app-owned click handler (A8.7) ───────────────────────────────────────

describe('CalendarClient — no app-owned click handler (A8.7)', () => {
  it('does not pass an onEventClick handler to WeekCalendarView', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const view = screen.getByTestId('week-calendar-view')
    expect(view.dataset.hasEventClick).toBe('false')
  })
})

// ── per-day windows + 24h format pass-through (A9) ──────────────────────────
//
// page.tsx resolves per-day awake windows (fractional hours) and the 24h format
// preference and threads them through CalendarClient into WeekCalendarView.

describe('CalendarClient — per-day windows and 24h pass-through (A9)', () => {
  it('forwards dayWindows (7 Sun-first entries) to WeekCalendarView unchanged', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    const view = screen.getByTestId('week-calendar-view')
    expect(view.dataset.dayWindowsLength).toBe('7')
    expect(view.dataset.dayWindowsWake0).toBe('9')
  })

  it('forwards use24h to WeekCalendarView', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={true}
      />,
    )
    const view = screen.getByTestId('week-calendar-view')
    expect(view.dataset.use24h).toBe('true')
  })
})

// ── completion contract mapping (0.17.0) ────────────────────────────────────
//
// toLibraryEvent maps the app status/streak onto the library's completion
// contract: completed (status === 'completed'), completable (always opt-in),
// and streak (flame+count on the time line).

describe('CalendarClient — completion contract mapping (0.17.0)', () => {
  it('maps status to completed and marks every chip completable, forwarding streak', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    const view = screen.getByTestId('week-calendar-view')
    // evt-1 is pending → completed:false; evt-done is completed → completed:true.
    expect(view.dataset.evt0Completed).toBe('false')
    expect(view.dataset.evt1Completed).toBe('true')
    expect(view.dataset.evt0Completable).toBe('true')
    // Streak is forwarded verbatim (evt-1 fixture has streak 5).
    expect(view.dataset.evt0Streak).toBe('5')
  })
})

// ── complete-toggle persistence (0.17.0) ────────────────────────────────────
//
// onEventToggleComplete mirrors useActivityActions.handleComplete: recurring
// tasks log an occurrence via recordCompletion, non-recurring tasks/goals flip
// status via updateTask. On failure it toasts and resyncs in place to restore.

describe('CalendarClient — complete-toggle persistence (0.17.0)', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    recordCompletionMock.mockClear()
    recordCompletionMock.mockResolvedValue({})
    updateTaskMock.mockClear()
    updateTaskMock.mockResolvedValue({})
    toastErrorMock.mockClear()
  })

  it('logs a recurring event via recordCompletion (not updateTask)', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-toggle-recurring' }))

    await waitFor(() => expect(recordCompletionMock).toHaveBeenCalledWith({ taskId: 'evt-1' }))
    expect(updateTaskMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('marks a non-recurring event complete via updateTask (not recordCompletion)', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-toggle-nonrecurring' }))

    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith({ id: 'evt-done', status: 'completed' }),
    )
    expect(recordCompletionMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('toasts and resyncs in place when a recurring completion fails to persist', async () => {
    recordCompletionMock.mockResolvedValueOnce({ error: 'Unauthorized' })
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const beforeNode = screen.getByTestId('week-calendar-view')
    await user.click(screen.getByRole('button', { name: 'trigger-toggle-recurring' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not log completion'))
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })

  it('toasts and resyncs in place when a non-recurring completion fails to persist', async () => {
    updateTaskMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const beforeNode = screen.getByTestId('week-calendar-view')
    await user.click(screen.getByRole('button', { name: 'trigger-toggle-nonrecurring' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not mark complete'))
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })

  // Direction bug (wave 2.2 Preview Gate): the library hands off the TOGGLED
  // event, so completed:false means "un-complete this now" — both recurring
  // and non-recurring events must go through updateTask({status:'pending'}).
  // There is no undo-completion primitive (recordCompletion only marks a task
  // done); streak values are derived on read, so un-completing recomputes them.
  it('marks a recurring event incomplete via updateTask status pending (not recordCompletion)', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-toggle-recurring-uncomplete' }))

    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith({ id: 'evt-1', status: 'pending' }),
    )
    expect(recordCompletionMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('marks a non-recurring event incomplete via updateTask status pending', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-toggle-nonrecurring-uncomplete' }))

    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith({ id: 'evt-done', status: 'pending' }),
    )
    expect(recordCompletionMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('toasts and resyncs in place when marking incomplete fails to persist', async () => {
    updateTaskMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const beforeNode = screen.getByTestId('week-calendar-view')
    await user.click(screen.getByRole('button', { name: 'trigger-toggle-recurring-uncomplete' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not mark incomplete'))
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })
})

// ── lock toggle (A2.4) ──────────────────────────────────────────────────────
//
// The chip's lock affordance bubbles up as onEventToggleLock. The app flips the
// row's PERSISTED locked state (server truth) and persists it via updateTask with
// EXACTLY { id, locked } — no other fields. Lock never enters the complete-
// toggle or series-edit routing predicates.

describe('CalendarClient — lock toggle (A2.4)', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    updateTaskMock.mockClear()
    updateTaskMock.mockResolvedValue({})
    updateTaskSeriesMock.mockClear()
    updateTaskSeriesMock.mockResolvedValue({})
    recordCompletionMock.mockClear()
    toastErrorMock.mockClear()
  })

  it('seeds the persisted locked flag onto the library event', () => {
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    const view = screen.getByTestId('week-calendar-view')
    // The locked fixture seeds locked:true; the unlocked evt-1 seeds no flag.
    expect(view.dataset.evtLocked).toBe('true')
    expect(view.dataset.evt0Locked).toBe('')
  })

  it('locks an unlocked event via updateTask with exactly { id, locked: true }', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-toggle-lock' }))

    await waitFor(() => expect(updateTaskMock).toHaveBeenCalledWith({ id: 'evt-1', locked: true }))
    // Lock is neither a series-shaped edit nor a completion change.
    expect(updateTaskSeriesMock).not.toHaveBeenCalled()
    expect(recordCompletionMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('unlocks a locked event via updateTask with exactly { id, locked: false }', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'trigger-toggle-unlock' }))

    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith({ id: 'evt-locked', locked: false }),
    )
    expect(updateTaskSeriesMock).not.toHaveBeenCalled()
  })

  it('toasts and resyncs in place when the lock update fails to persist', async () => {
    updateTaskMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart={WEEK_START}
        events={EVENTS}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const beforeNode = screen.getByTestId('week-calendar-view')
    await user.click(screen.getByRole('button', { name: 'trigger-toggle-lock' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not update lock — calendar restored'),
    )
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })
})
