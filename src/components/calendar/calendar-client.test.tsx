import * as React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CalendarClient } from './calendar-client'

// ── shared mock functions ──────────────────────────────────────────────────

const refreshMock = vi.fn()
const createTaskMock = vi.fn()
const deleteTaskMock = vi.fn()
const rescheduleTaskMock = vi.fn()
const updateTaskMock = vi.fn()
const toastErrorMock = vi.fn()

// Captures the onSubmit prop from ActivityFormDialog each render so tests can
// drive it directly (rather than clicking through the real form UI).
let capturedAfdOnSubmit: ((values: unknown) => void) | undefined

// Observes every onOpenChange(open) the dialog fires, so tests can assert that
// real-Radix close semantics (onOpenChange(false) on ANY close — cancel OR
// confirm) actually ran and thus exercised handleDeleteOpenChange.
const onOpenChangeSpy = vi.fn<(open: boolean) => void>()

// AlertDialog stores a wrapper around its onOpenChange here so the Cancel and
// Action stubs can invoke it — mirroring Radix, which fires onOpenChange(false)
// whenever the dialog closes (via Cancel, via Action, or via Escape/overlay).
let capturedOnOpenChange: ((open: boolean) => void) | undefined

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
}))

// Sub-components not under test — stub as null to avoid loading heavy deps.
vi.mock('@/components/calendar/check-in-sheet', () => ({
  CheckInSheet: () => null,
}))
vi.mock('@/components/calendar/perfect-week-celebration', () => ({
  PerfectWeekCelebration: () => null,
}))
vi.mock('@/components/tasks/task-form-dialog', () => ({
  TaskFormDialog: ({ open }: { open?: boolean }) =>
    open ? <div data-testid="task-form-dialog" /> : null,
}))
vi.mock('@/components/goals/goal-form-dialog', () => ({
  GoalFormDialog: () => null,
}))
vi.mock('@/components/habits/habit-form-dialog', () => ({
  HabitFormDialog: () => null,
}))

// ActivityFormDialog stub: renders key initialValues as data attrs so contract
// bugs are visible; captures onSubmit so tests can drive submission directly.
interface MockActivityFormDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmit: (values: unknown) => void
  readonly initialType?: string
  readonly lockType?: boolean
  readonly isPending?: boolean
  readonly initialValues?: {
    readonly type?: string
    readonly title?: string
    readonly targetDate?: string | null
    readonly startAt?: string | null
    readonly endAt?: string | null
    readonly color?: string | null
    readonly allDay?: boolean
    readonly location?: string | null
    readonly description?: string | null
  }
}

vi.mock('@/components/activity/activity-form-dialog', () => ({
  ActivityFormDialog: (props: MockActivityFormDialogProps) => {
    capturedAfdOnSubmit = props.onSubmit
    if (!props.open) return null
    return (
      <div
        data-testid="activity-form-dialog"
        data-lock-type={String(props.lockType ?? false)}
        data-initial-type={props.initialType ?? 'task'}
      >
        <span data-testid="afd-title">{String(props.initialValues?.title ?? '')}</span>
        <span data-testid="afd-color">{String(props.initialValues?.color ?? '')}</span>
        <span data-testid="afd-all-day">{String(props.initialValues?.allDay ?? '')}</span>
        <span data-testid="afd-location">{String(props.initialValues?.location ?? '')}</span>
        <span data-testid="afd-description">{String(props.initialValues?.description ?? '')}</span>
        <span data-testid="afd-start-at">{String(props.initialValues?.startAt ?? '')}</span>
        <span data-testid="afd-end-at">{String(props.initialValues?.endAt ?? '')}</span>
        <span data-testid="afd-target-date">{String(props.initialValues?.targetDate ?? '')}</span>
      </div>
    )
  },
}))

// ── @/lib/ui mock ──────────────────────────────────────────────────────────

interface MockLibEvent {
  readonly id: string
  readonly title: string
  readonly start: string
  readonly end: string
  readonly color: string
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
}

interface WeekCalendarViewProps {
  readonly defaultWeekStart?: string
  readonly events?: ReadonlyArray<MockLibEvent>
  readonly onEventMove?: (e: MockLibEvent) => void
  readonly onEventResize?: (e: MockLibEvent) => void
  readonly onEventDelete?: (e: MockLibEvent) => void
  readonly onEventEdit?: (e: MockLibEvent) => void
  readonly onEventClick?: (e: MockLibEvent) => void
  readonly onEventCreate?: (e: MockCreatePayload) => void
}

// id matches EVENTS[0].id so isCompleted() in handleTimeChange returns false.
const STUB_LIB_EVENT: MockLibEvent = {
  id: 'evt-1',
  title: 'Test event',
  start: '2026-01-06T09:00:00.000Z',
  end: '2026-01-06T10:00:00.000Z',
  color: 'blue',
}

// Stub for the goal fixture used in D.3 edit-goal tests.
const STUB_GOAL_LIB_EVENT: MockLibEvent = {
  id: 'evt-2',
  title: 'Run marathon',
  start: '2026-06-15T12:00:00.000Z',
  end: '2026-06-15T13:00:00.000Z',
  color: 'amber',
}

// Payload the library popover emits when dragging to create a new event.
const STUB_CREATE_PAYLOAD: MockCreatePayload = {
  title: 'x',
  start: '2026-01-06T09:00:00.000Z',
  end: '2026-01-06T10:00:00.000Z',
  allDay: true,
  color: 'blue',
  location: 'Gym',
  description: 'leg day',
  recurrenceFrequency: 'weekly',
}

vi.mock('@/lib/ui', () => ({
  WeekCalendarView: (props: WeekCalendarViewProps) => (
    <div data-testid="week-calendar-view">
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
      <button type="button" onClick={() => props.onEventEdit?.(STUB_LIB_EVENT)}>
        trigger-edit-task
      </button>
      <button type="button" onClick={() => props.onEventEdit?.(STUB_GOAL_LIB_EVENT)}>
        trigger-edit-goal
      </button>
    </div>
  ),
  Button: ({
    children,
    onClick,
    type: btnType,
  }: {
    children: React.ReactNode
    onClick?: () => void
    type?: 'button' | 'submit' | 'reset'
  }) => (
    <button type={btnType ?? 'button'} onClick={onClick}>
      {children}
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

const EVENTS = [
  {
    id: 'evt-1',
    title: 'Test event',
    start: '2026-01-06T09:00:00.000Z',
    end: '2026-01-06T10:00:00.000Z',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
  },
]

// ── characterization tests ─────────────────────────────────────────────────
//
// These tests pin the CURRENT resync behavior of CalendarClient so that the
// upcoming D.2/D.3 refactor can prove behavioral-identity: any test failure
// after the refactor means behavior changed.
//
// Mechanism under test:
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
    render(<CalendarClient weekStart={WEEK_START} events={EVENTS} />)

    const beforeNode = screen.getByTestId('week-calendar-view')

    // Open the delete confirmation dialog.
    await user.click(screen.getByRole('button', { name: 'trigger-delete' }))
    // Confirm — handleConfirmDelete fires; deleteTask returns { error }.
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not delete event'))

    // resetKey was bumped → key prop changed → WeekCalendarView remounted → new DOM node.
    const afterNode = screen.getByTestId('week-calendar-view')
    expect(afterNode).not.toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })

  it('successful delete does NOT bump resetKey (confirmedRef guards against remount)', async () => {
    // deleteTaskMock already returns {} from beforeEach — no 'error' in result.
    const user = userEvent.setup()
    render(<CalendarClient weekStart={WEEK_START} events={EVENTS} />)

    const beforeNode = screen.getByTestId('week-calendar-view')

    await user.click(screen.getByRole('button', { name: 'trigger-delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteTaskMock).toHaveBeenCalledWith({ id: 'evt-1' }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())

    // Real Radix fires onOpenChange(false) on the confirmed close, so
    // handleDeleteOpenChange DID run — the guard is genuinely exercised.
    expect(onOpenChangeSpy).toHaveBeenCalledWith(false)

    expect(toastErrorMock).not.toHaveBeenCalled()
    // confirmedRef.current was true when handleDeleteOpenChange ran → it skipped
    // setResetKey → no remount → same DOM node. Deleting `confirmedRef.current =
    // true` from handleConfirmDelete would make the close bump resetKey (like a
    // cancel), remounting and failing this identity assertion.
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
  })

  it('cancelling the delete dialog bumps resetKey (WeekCalendarView remounts)', async () => {
    const user = userEvent.setup()
    render(<CalendarClient weekStart={WEEK_START} events={EVENTS} />)

    const beforeNode = screen.getByTestId('week-calendar-view')

    // Open dialog then dismiss via Cancel.
    await user.click(screen.getByRole('button', { name: 'trigger-delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    // handleDeleteOpenChange(false) fires; confirmedRef.current is false → resetKey bumps.
    await waitFor(() => {
      expect(screen.getByTestId('week-calendar-view')).not.toBe(beforeNode)
    })
    expect(deleteTaskMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('reschedule failure (move) bumps resetKey (WeekCalendarView remounts) and calls toast.error', async () => {
    rescheduleTaskMock.mockResolvedValueOnce({ error: 'Unauthorized' })
    const user = userEvent.setup()
    render(<CalendarClient weekStart={WEEK_START} events={EVENTS} />)

    const beforeNode = screen.getByTestId('week-calendar-view')

    await user.click(screen.getByRole('button', { name: 'trigger-move' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not reschedule — calendar restored'),
    )

    // resetKey was bumped → WeekCalendarView remounted → different DOM node.
    const afterNode = screen.getByTestId('week-calendar-view')
    expect(afterNode).not.toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })
})

// ── event-create wiring tests ──────────────────────────────────────────────
//
// These tests verify that dragging to create a slot calls createTask directly
// (no TaskFormDialog intermediary) and uses the resync machinery.

describe('CalendarClient — event create wiring', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    createTaskMock.mockClear()
    createTaskMock.mockResolvedValue({})
    toastErrorMock.mockClear()
  })

  it('onEventCreate persists a task from the library payload', async () => {
    const user = userEvent.setup()
    render(<CalendarClient weekStart={WEEK_START} events={EVENTS} />)

    await user.click(screen.getByRole('button', { name: 'trigger-create' }))

    await waitFor(() =>
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task',
          startAt: expect.any(String),
          endAt: expect.any(String),
          allDay: true,
          color: 'blue',
          location: 'Gym',
          description: 'leg day',
          recurrence: 'weekly',
        }),
      ),
    )
  })

  it('does not open TaskFormDialog on create', async () => {
    const user = userEvent.setup()
    render(<CalendarClient weekStart={WEEK_START} events={EVENTS} />)

    // No dialog before the action.
    expect(screen.queryByTestId('task-form-dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'trigger-create' }))

    // Still no TaskFormDialog after drag-create — it goes straight to createTask.
    expect(screen.queryByTestId('task-form-dialog')).not.toBeInTheDocument()
  })
})

// ── D.3: unified ActivityFormDialog tests ─────────────────────────────────
//
// Verifies that:
//   • + New button opens the app ActivityFormDialog unlocked.
//   • Editing a TASK event opens ActivityFormDialog locked to task and hydrates
//     all rich fields (color, allDay, location, description, UTC start/end).
//   • Editing a GOAL event opens locked to goal with a date-only targetDate.
//   • Edit submits call updateTask with the correct payload, including the
//     noon-UTC goal-date trap on goal submits.
//   • GoalFormDialog / HabitFormDialog / TaskFormDialog are never rendered.

// Full task fixture includes all rich fields needed for hydration assertions.
const TASK_EVENT_FULL = {
  id: 'evt-1',
  title: 'Test event',
  start: '2026-01-06T09:00:00.000Z',
  end: '2026-01-06T10:00:00.000Z',
  type: 'task' as const,
  status: 'pending' as const,
  streak: 0,
  activityType: 'solo',
  visibility: 'only_me',
  color: 'violet',
  allDay: false,
  location: 'Gym',
  description: 'Leg day',
}

// Goal fixture: id matches STUB_GOAL_LIB_EVENT so handleEventEdit can look it up.
const GOAL_EVENT = {
  id: 'evt-2',
  title: 'Run marathon',
  // Goal stored at noon-UTC; slice(0,10) gives the date-only targetDate for the dialog.
  start: '2026-06-15T12:00:00.000Z',
  end: '2026-06-15T13:00:00.000Z',
  type: 'goal' as const,
  status: 'pending' as const,
  streak: 0,
  activityType: 'solo',
  visibility: 'only_me',
  color: null,
  allDay: false,
  location: null,
  description: null,
}

const EVENTS_D3 = [TASK_EVENT_FULL, GOAL_EVENT]

describe('CalendarClient — unified ActivityFormDialog (D.3)', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    updateTaskMock.mockClear()
    updateTaskMock.mockResolvedValue({})
    createTaskMock.mockClear()
    createTaskMock.mockResolvedValue({})
    toastErrorMock.mockClear()
    capturedAfdOnSubmit = undefined
  })

  it('+ New button opens ActivityFormDialog unlocked (task or goal)', async () => {
    const user = userEvent.setup()
    render(<CalendarClient weekStart={WEEK_START} events={EVENTS_D3} />)

    expect(screen.queryByTestId('activity-form-dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ New' }))

    const dialog = screen.getByTestId('activity-form-dialog')
    expect(dialog).toBeInTheDocument()
    // lockType must be false so the user can choose task or goal.
    expect(dialog.dataset.lockType).toBe('false')
  })

  it('editing a TASK event opens ActivityFormDialog locked to task with all rich fields', async () => {
    const user = userEvent.setup()
    render(<CalendarClient weekStart={WEEK_START} events={EVENTS_D3} />)

    await user.click(screen.getByRole('button', { name: 'trigger-edit-task' }))

    const dialog = screen.getByTestId('activity-form-dialog')
    expect(dialog.dataset.lockType).toBe('true')
    expect(dialog.dataset.initialType).toBe('task')

    // Contract: all rich fields surfaced in the mock so dropped fields are visible.
    expect(screen.getByTestId('afd-title').textContent).toBe('Test event')
    expect(screen.getByTestId('afd-color').textContent).toBe('violet')
    expect(screen.getByTestId('afd-all-day').textContent).toBe('false')
    expect(screen.getByTestId('afd-location').textContent).toBe('Gym')
    expect(screen.getByTestId('afd-description').textContent).toBe('Leg day')
    expect(screen.getByTestId('afd-start-at').textContent).toBe('2026-01-06T09:00:00.000Z')
    expect(screen.getByTestId('afd-end-at').textContent).toBe('2026-01-06T10:00:00.000Z')
  })

  it('edit TASK submit calls updateTask with color, allDay, location, description', async () => {
    const user = userEvent.setup()
    render(<CalendarClient weekStart={WEEK_START} events={EVENTS_D3} />)

    await user.click(screen.getByRole('button', { name: 'trigger-edit-task' }))
    expect(screen.getByTestId('activity-form-dialog')).toBeInTheDocument()

    // Drive submit directly via captured onSubmit — simulates user hitting Save.
    await act(async () => {
      capturedAfdOnSubmit?.({
        type: 'task',
        title: 'Test event',
        startAt: '2026-01-06T09:00:00.000Z',
        endAt: '2026-01-06T10:00:00.000Z',
        color: 'violet',
        location: 'Gym',
        description: 'Leg day',
        allDay: false,
        social: { activityType: 'solo', visibility: 'only_me' },
      })
    })

    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'evt-1',
          title: 'Test event',
          startAt: '2026-01-06T09:00:00.000Z',
          endAt: '2026-01-06T10:00:00.000Z',
          color: 'violet',
          location: 'Gym',
          description: 'Leg day',
          allDay: false,
        }),
      ),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  it('editing a GOAL event opens ActivityFormDialog locked to goal with date-only targetDate', async () => {
    const user = userEvent.setup()
    render(<CalendarClient weekStart={WEEK_START} events={EVENTS_D3} />)

    await user.click(screen.getByRole('button', { name: 'trigger-edit-goal' }))

    const dialog = screen.getByTestId('activity-form-dialog')
    expect(dialog.dataset.lockType).toBe('true')
    expect(dialog.dataset.initialType).toBe('goal')

    // targetDate must be date-only (YYYY-MM-DD) — a full ISO string yields
    // Invalid Date inside ActivityFormDialog and silently wipes the target date.
    expect(screen.getByTestId('afd-target-date').textContent).toBe('2026-06-15')
  })

  it('edit GOAL submit calls updateTask with noon-UTC targetDate (goal-date trap)', async () => {
    const user = userEvent.setup()
    render(<CalendarClient weekStart={WEEK_START} events={EVENTS_D3} />)

    await user.click(screen.getByRole('button', { name: 'trigger-edit-goal' }))
    expect(screen.getByTestId('activity-form-dialog')).toBeInTheDocument()

    // Dialog emits date-only targetDate; handler must append T12:00:00.000Z before
    // calling updateTask (whose schema requires a full datetime string).
    await act(async () => {
      capturedAfdOnSubmit?.({
        type: 'goal',
        title: 'Run marathon',
        targetDate: '2026-06-15',
        location: null,
        description: null,
        social: { activityType: 'solo', visibility: 'only_me' },
      })
    })

    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'evt-2',
          title: 'Run marathon',
          // The noon-UTC suffix is the regression guard — date-only rejects the
          // updateTask Zod schema (.datetime()) and the edit silently fails.
          targetDate: '2026-06-15T12:00:00.000Z',
        }),
      ),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  it('GoalFormDialog, HabitFormDialog, and TaskFormDialog are never rendered', () => {
    render(<CalendarClient weekStart={WEEK_START} events={EVENTS_D3} />)
    expect(screen.queryByTestId('task-form-dialog')).not.toBeInTheDocument()
    // GoalFormDialog / HabitFormDialog mocks return null so their test ids never appear.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
