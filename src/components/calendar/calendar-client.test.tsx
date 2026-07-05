import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CalendarClient } from './calendar-client'

// ── shared mock functions ──────────────────────────────────────────────────

const refreshMock = vi.fn()
const createTaskMock = vi.fn()
const deleteTaskMock = vi.fn()
const rescheduleTaskMock = vi.fn()
const recordCompletionMock = vi.fn()
const updateTaskMock = vi.fn()
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
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/tasks', () => ({
  createTask: (input: unknown) => createTaskMock(input),
  deleteTask: (input: unknown) => deleteTaskMock(input),
  updateTask: (input: unknown) => updateTaskMock(input),
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
  readonly completed?: boolean
  readonly completable?: boolean
  readonly streak?: number
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
  readonly hourStart?: number
  readonly hourCount?: number
  readonly sleepEnabled?: boolean
  readonly sleepStart?: number
  readonly sleepEnd?: number
  readonly dayWindows?: readonly MockDayWindow[]
  readonly use24h?: boolean
}

// id matches EVENTS[0].id so isCompleted() returns false.
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

// Completed event (id matches the completed EVENTS fixture) — edits are refused.
const STUB_COMPLETED_LIB_EVENT: MockLibEvent = {
  id: 'evt-done',
  title: 'Done event',
  start: '2026-01-06T09:00:00.000Z',
  end: '2026-01-06T10:00:00.000Z',
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
      {/* Recurring event (evt-1 has recurrence 'weekly') → recordCompletion. */}
      <button type="button" onClick={() => props.onEventToggleComplete?.(STUB_LIB_EVENT)}>
        trigger-toggle-recurring
      </button>
      {/* Non-recurring event (evt-done has no recurrence) → updateTask status. */}
      <button type="button" onClick={() => props.onEventToggleComplete?.(STUB_COMPLETED_LIB_EVENT)}>
        trigger-toggle-nonrecurring
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
]

// ── characterization tests ─────────────────────────────────────────────────
//
// These tests pin the resync behavior of CalendarClient:
//   • WeekCalendarView never re-derives from props; CalendarClient remounts it
//     by bumping `resetKey` (key={weekStart-resetKey}).
//   • Failed delete  → toast.error + resetKey bump (remount).
//   • Successful delete → confirmedRef guards against an extra resetKey bump.
//   • Cancel dialog  → handleDeleteOpenChange(false) bumps resetKey because
//                       confirmedRef.current is still false.
//   • Move/resize failure → toast.error + resetKey bump (remount).

describe('CalendarClient — resync machinery (characterization)', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    deleteTaskMock.mockClear()
    deleteTaskMock.mockResolvedValue({})
    rescheduleTaskMock.mockClear()
    rescheduleTaskMock.mockResolvedValue({})
    toastErrorMock.mockClear()
    onOpenChangeSpy.mockClear()
    capturedOnOpenChange = undefined
  })

  it('failed delete bumps resetKey (WeekCalendarView remounts) and calls toast.error', async () => {
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

    await user.click(screen.getByRole('button', { name: 'trigger-delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not delete event'))

    const afterNode = screen.getByTestId('week-calendar-view')
    expect(afterNode).not.toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })

  it('successful delete does NOT bump resetKey (confirmedRef guards against remount)', async () => {
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

    expect(onOpenChangeSpy).toHaveBeenCalledWith(false)
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
  })

  it('cancelling the delete dialog bumps resetKey (WeekCalendarView remounts)', async () => {
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

    await waitFor(() => {
      expect(screen.getByTestId('week-calendar-view')).not.toBe(beforeNode)
    })
    expect(deleteTaskMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('reschedule failure (move) bumps resetKey (WeekCalendarView remounts) and calls toast.error', async () => {
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

    const afterNode = screen.getByTestId('week-calendar-view')
    expect(afterNode).not.toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
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

  it('refuses to edit a completed event (remounts to restore, no updateTask)', async () => {
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
    await user.click(screen.getByRole('button', { name: 'trigger-edit-completed' }))

    await waitFor(() => {
      expect(screen.getByTestId('week-calendar-view')).not.toBe(beforeNode)
    })
    expect(updateTaskMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('surfaces a toast and remounts when the edit fails to persist', async () => {
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
    expect(screen.getByTestId('week-calendar-view')).not.toBe(beforeNode)
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
// status via updateTask. On failure it toasts and remounts to restore.

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

    await waitFor(() =>
      expect(recordCompletionMock).toHaveBeenCalledWith({ taskId: 'evt-1', outcome: 'done' }),
    )
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

  it('toasts and remounts when a recurring completion fails to persist', async () => {
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
    expect(screen.getByTestId('week-calendar-view')).not.toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })

  it('toasts and remounts when a non-recurring completion fails to persist', async () => {
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
    expect(screen.getByTestId('week-calendar-view')).not.toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })
})
