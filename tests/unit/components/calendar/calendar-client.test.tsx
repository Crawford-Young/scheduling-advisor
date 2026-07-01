import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { CalendarClient } from '@/components/calendar/calendar-client'

const mockRescheduleTask = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'e1' } }))
const mockDeleteTask = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { success: true } }))
const mockToastError = vi.hoisted(() => vi.fn())
const mockRefresh = vi.hoisted(() => vi.fn())
const mountCount = vi.hoisted(() => ({ value: 0 }))

vi.mock('@/server/actions/consistency', () => ({ rescheduleTask: mockRescheduleTask }))
vi.mock('@/server/actions/tasks', () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: mockDeleteTask,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

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
          <button
            key={e.id}
            onClick={() => {
              const onEventClick = props.onEventClick as ((e: unknown) => void) | undefined
              onEventClick?.(e)
            }}
          >
            {e.title}
          </button>
        ))}
      </div>
    )
  },
}))

vi.mock('@/components/calendar/check-in-sheet', () => ({
  CheckInSheet: ({
    item,
    onClose,
    onPerfectWeek,
  }: {
    item: { title: string }
    onClose: () => void
    onPerfectWeek: () => void
  }) => (
    <div data-testid="check-in-sheet">
      <span>{item.title}</span>
      <button onClick={onClose}>Close</button>
      <button onClick={onPerfectWeek}>Perfect week</button>
    </div>
  ),
}))

vi.mock('@/components/calendar/perfect-week-celebration', () => ({
  PerfectWeekCelebration: ({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) =>
    visible ? (
      <div data-testid="perfect-week">
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    ) : null,
}))

// Old per-type dialog mocks — kept as no-ops so any stale import paths don't break loading.
vi.mock('@/components/tasks/task-form-dialog', () => ({ TaskFormDialog: () => null }))
vi.mock('@/components/goals/goal-form-dialog', () => ({ GoalFormDialog: () => null }))
vi.mock('@/components/habits/habit-form-dialog', () => ({ HabitFormDialog: () => null }))

// calendar-client.tsx now uses ActivityFormDialog for all edit/create dialogs.
vi.mock('@/components/activity/activity-form-dialog', () => ({
  ActivityFormDialog: ({
    open,
    initialType,
    lockType,
    initialValues,
    onOpenChange,
  }: {
    open: boolean
    initialType?: string
    lockType?: boolean
    initialValues?: Record<string, unknown>
    onOpenChange?: (open: boolean) => void
  }) =>
    open ? (
      <div
        data-testid="activity-form-dialog"
        data-initial-type={initialType}
        data-lock-type={String(lockType ?? false)}
      >
        <span>{String(initialValues?.title ?? '')}</span>
        <button onClick={() => onOpenChange?.(false)}>Close activity dialog</button>
      </div>
    ) : null,
}))

const events = [
  {
    id: 'e1',
    title: 'Morning run',
    start: '2026-05-29T07:00:00',
    end: '2026-05-29T08:00:00',
    // 'habit' type has been removed — all recurring activities are tasks.
    type: 'task' as const,
    status: 'pending' as const,
    streak: 3,
    activityType: 'solo',
    visibility: 'only_me',
  },
  {
    id: 'e2',
    title: 'Done event',
    start: '2026-05-29T09:00:00',
    end: '2026-05-29T10:00:00',
    type: 'task' as const,
    status: 'completed' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
  },
  {
    id: 'e3',
    title: 'Write book',
    start: '2026-05-29T10:00:00',
    end: '2026-05-29T11:00:00',
    type: 'goal' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
  },
  {
    id: 'e4',
    title: 'Ship report',
    start: '2026-05-29T13:00:00',
    end: '2026-05-29T14:00:00',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
  },
]

describe('CalendarClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedProps = {}
    mountCount.value = 0
  })

  it('renders the calendar', () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
    expect(screen.getByText('Morning run')).toBeInTheDocument()
  })

  it('opens CheckInSheet when pending event clicked', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
    await userEvent.click(screen.getByText('Morning run'))
    expect(screen.getByTestId('check-in-sheet')).toBeInTheDocument()
  })

  it('does not open CheckInSheet for completed events', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
    await userEvent.click(screen.getByText('Done event'))
    expect(screen.queryByTestId('check-in-sheet')).not.toBeInTheDocument()
  })

  it('closes CheckInSheet on onClose', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
    await userEvent.click(screen.getByText('Morning run'))
    await userEvent.click(screen.getByText('Close'))
    expect(screen.queryByTestId('check-in-sheet')).not.toBeInTheDocument()
  })

  it('shows PerfectWeekCelebration when onPerfectWeek fires', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
    await userEvent.click(screen.getByText('Morning run'))
    await userEvent.click(screen.getByText('Perfect week'))
    expect(screen.getByTestId('perfect-week')).toBeInTheDocument()
  })

  it('dismisses PerfectWeekCelebration on dismiss button click', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
    await userEvent.click(screen.getByText('Morning run'))
    await userEvent.click(screen.getByText('Perfect week'))
    expect(screen.getByTestId('perfect-week')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('perfect-week')).not.toBeInTheDocument()
  })

  it('passes axe', async () => {
    const { container } = render(
      <CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  describe('move and resize', () => {
    it('calls rescheduleTask with UTC ISO times on move', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const onEventMove = capturedProps.onEventMove as (e: unknown) => void
      onEventMove({
        id: 'e1',
        title: 'Morning run',
        start: '2026-05-29T09:00:00',
        end: '2026-05-29T10:00:00',
      })
      await vi.waitFor(() => {
        expect(mockRescheduleTask).toHaveBeenCalledWith({
          taskId: 'e1',
          newStartAt: new Date('2026-05-29T09:00:00').toISOString(),
          newEndAt: new Date('2026-05-29T10:00:00').toISOString(),
        })
      })
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('calls rescheduleTask on resize', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const onEventResize = capturedProps.onEventResize as (e: unknown) => void
      onEventResize({
        id: 'e1',
        title: 'Morning run',
        start: '2026-05-29T07:00:00',
        end: '2026-05-29T09:30:00',
      })
      await vi.waitFor(() => expect(mockRescheduleTask).toHaveBeenCalled())
    })

    it('ignores move of completed event and refreshes to snap back', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const onEventMove = capturedProps.onEventMove as (e: unknown) => void
      onEventMove({
        id: 'e2',
        title: 'Done event',
        start: '2026-05-29T11:00:00',
        end: '2026-05-29T12:00:00',
      })
      await vi.waitFor(() => expect(mockRefresh).toHaveBeenCalled())
      expect(mockRescheduleTask).not.toHaveBeenCalled()
    })

    it('shows toast on reschedule error', async () => {
      mockRescheduleTask.mockResolvedValueOnce({ error: 'Not found' })
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const onEventMove = capturedProps.onEventMove as (e: unknown) => void
      onEventMove({
        id: 'e1',
        title: 'Morning run',
        start: '2026-05-29T09:00:00',
        end: '2026-05-29T10:00:00',
      })
      await vi.waitFor(() => expect(mockToastError).toHaveBeenCalled())
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('remounts calendar on completed-event move (guard path)', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const initialMountCount = mountCount.value
      const onEventMove = capturedProps.onEventMove as (e: unknown) => void
      onEventMove({
        id: 'e2',
        title: 'Done event',
        start: '2026-05-29T11:00:00',
        end: '2026-05-29T12:00:00',
      })
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })

    it('remounts calendar on reschedule error', async () => {
      mockRescheduleTask.mockResolvedValueOnce({ error: 'Not found' })
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const initialMountCount = mountCount.value
      const onEventMove = capturedProps.onEventMove as (e: unknown) => void
      onEventMove({
        id: 'e1',
        title: 'Morning run',
        start: '2026-05-29T09:00:00',
        end: '2026-05-29T10:00:00',
      })
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })

    it('does NOT remount calendar on successful reschedule', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const initialMountCount = mountCount.value
      const onEventMove = capturedProps.onEventMove as (e: unknown) => void
      onEventMove({
        id: 'e1',
        title: 'Morning run',
        start: '2026-05-29T09:00:00',
        end: '2026-05-29T10:00:00',
      })
      await vi.waitFor(() => expect(mockRefresh).toHaveBeenCalled())
      expect(mountCount.value).toBe(initialMountCount)
    })
  })

  describe('delete', () => {
    it('opens confirm dialog on onEventDelete, deletes on confirm', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      expect(await screen.findByText(/delete "Morning run"/i)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
      await vi.waitFor(() => expect(mockDeleteTask).toHaveBeenCalledWith({ id: 'e1' }))
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('does not delete on cancel', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await userEvent.click(await screen.findByRole('button', { name: /cancel/i }))
      expect(mockDeleteTask).not.toHaveBeenCalled()
    })

    it('shows toast on delete error', async () => {
      mockDeleteTask.mockResolvedValueOnce({ error: 'Not found' })
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }))
      await vi.waitFor(() => expect(mockToastError).toHaveBeenCalled())
    })

    it('remounts calendar on cancel (restores optimistic delete)', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const initialMountCount = mountCount.value
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await screen.findByText(/delete "Morning run"/i)
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })

    it('does NOT remount calendar on successful delete', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const initialMountCount = mountCount.value
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await screen.findByText(/delete "Morning run"/i)
      await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
      await vi.waitFor(() => expect(mockDeleteTask).toHaveBeenCalled())
      expect(mountCount.value).toBe(initialMountCount)
    })

    it('remounts calendar on delete error', async () => {
      mockDeleteTask.mockResolvedValueOnce({ error: 'Not found' })
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      const initialMountCount = mountCount.value
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await screen.findByText(/delete "Morning run"/i)
      await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })
  })

  // Edit and create suites moved to src/components/calendar/calendar-client.test.tsx (D.3).
  // Retained here: guard paths that are independent of dialog type.
  describe('edit', () => {
    it('ignores edit of completed event (no dialog opens)', () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      ;(capturedProps.onEventEdit as (e: unknown) => void)({ id: 'e2', title: 'Done event' })
      expect(screen.queryByTestId('activity-form-dialog')).not.toBeInTheDocument()
    })

    it('opens no dialog when event id is not found in events list', () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      ;(capturedProps.onEventEdit as (e: unknown) => void)({ id: 'nope', title: 'Ghost' })
      expect(screen.queryByTestId('activity-form-dialog')).not.toBeInTheDocument()
    })

    it('opens ActivityFormDialog locked to task for task-type event', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      ;(capturedProps.onEventEdit as (e: unknown) => void)({ id: 'e4', title: 'Ship report' })
      const dialog = await screen.findByTestId('activity-form-dialog')
      expect(dialog.dataset.initialType).toBe('task')
      expect(dialog.dataset.lockType).toBe('true')
    })

    it('opens ActivityFormDialog locked to goal with date-only targetDate', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      ;(capturedProps.onEventEdit as (e: unknown) => void)({ id: 'e3', title: 'Write book' })
      const dialog = await screen.findByTestId('activity-form-dialog')
      expect(dialog.dataset.initialType).toBe('goal')
      expect(dialog.dataset.lockType).toBe('true')
    })

    it('closes ActivityFormDialog on onOpenChange(false)', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} wakeHour={9} sleepHour={17} />)
      ;(capturedProps.onEventEdit as (e: unknown) => void)({ id: 'e4', title: 'Ship report' })
      expect(await screen.findByTestId('activity-form-dialog')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Close activity dialog' }))
      expect(screen.queryByTestId('activity-form-dialog')).not.toBeInTheDocument()
    })
  })
})
