import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CalendarClient } from './calendar-client'

// ── shared mock functions ──────────────────────────────────────────────────

const refreshMock = vi.fn()
const deleteTaskMock = vi.fn()
const rescheduleTaskMock = vi.fn()
const toastErrorMock = vi.fn()

// AlertDialog stores its onOpenChange here so the AlertDialogCancel stub can
// invoke it — simulating what Radix does when the user dismisses the dialog.
let capturedOnOpenChange: ((open: boolean) => void) | undefined

// ── module mocks ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/tasks', () => ({
  deleteTask: (input: unknown) => deleteTaskMock(input),
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
  TaskFormDialog: () => null,
}))
vi.mock('@/components/goals/goal-form-dialog', () => ({
  GoalFormDialog: () => null,
}))
vi.mock('@/components/habits/habit-form-dialog', () => ({
  HabitFormDialog: () => null,
}))

// ── @/lib/ui mock ──────────────────────────────────────────────────────────

interface MockLibEvent {
  readonly id: string
  readonly title: string
  readonly start: string
  readonly end: string
  readonly color: string
}

interface WeekCalendarViewProps {
  readonly defaultWeekStart?: string
  readonly events?: ReadonlyArray<MockLibEvent>
  readonly onEventMove?: (e: MockLibEvent) => void
  readonly onEventResize?: (e: MockLibEvent) => void
  readonly onEventDelete?: (e: MockLibEvent) => void
  readonly onEventEdit?: (e: MockLibEvent) => void
  readonly onEventClick?: (e: MockLibEvent) => void
  readonly onEventCreate?: (e: { readonly start: string; readonly end: string }) => void
}

// id matches EVENTS[0].id so isCompleted() in handleTimeChange returns false.
const STUB_LIB_EVENT: MockLibEvent = {
  id: 'evt-1',
  title: 'Test event',
  start: '2026-01-06T09:00:00.000Z',
  end: '2026-01-06T10:00:00.000Z',
  color: 'blue',
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
    </div>
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
    // Capture so AlertDialogCancel can invoke it (simulates Radix dismiss).
    capturedOnOpenChange = onOpenChange
    return open ? <div role="alertdialog">{children}</div> : null
  },
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button type="button" onClick={() => capturedOnOpenChange?.(false)}>
      {children}
    </button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
  }) => (
    <button type="button" onClick={onClick}>
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

    expect(toastErrorMock).not.toHaveBeenCalled()
    // confirmedRef.current was true → handleDeleteOpenChange skipped setResetKey.
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
