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

const events = [
  {
    id: 'e1',
    title: 'Morning run',
    start: '2026-05-29T07:00:00',
    end: '2026-05-29T08:00:00',
    type: 'habit' as const,
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
]

describe('CalendarClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedProps = {}
    mountCount.value = 0
  })

  it('renders the calendar', () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} />)
    expect(screen.getByText('Morning run')).toBeInTheDocument()
  })

  it('opens CheckInSheet when pending event clicked', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} />)
    await userEvent.click(screen.getByText('Morning run'))
    expect(screen.getByTestId('check-in-sheet')).toBeInTheDocument()
  })

  it('does not open CheckInSheet for completed events', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} />)
    await userEvent.click(screen.getByText('Done event'))
    expect(screen.queryByTestId('check-in-sheet')).not.toBeInTheDocument()
  })

  it('closes CheckInSheet on onClose', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} />)
    await userEvent.click(screen.getByText('Morning run'))
    await userEvent.click(screen.getByText('Close'))
    expect(screen.queryByTestId('check-in-sheet')).not.toBeInTheDocument()
  })

  it('shows PerfectWeekCelebration when onPerfectWeek fires', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} />)
    await userEvent.click(screen.getByText('Morning run'))
    await userEvent.click(screen.getByText('Perfect week'))
    expect(screen.getByTestId('perfect-week')).toBeInTheDocument()
  })

  it('dismisses PerfectWeekCelebration on dismiss button click', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} />)
    await userEvent.click(screen.getByText('Morning run'))
    await userEvent.click(screen.getByText('Perfect week'))
    expect(screen.getByTestId('perfect-week')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('perfect-week')).not.toBeInTheDocument()
  })

  it('passes axe', async () => {
    const { container } = render(<CalendarClient weekStart="2026-05-25" events={events} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  describe('move and resize', () => {
    it('calls rescheduleTask with UTC ISO times on move', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
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
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
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
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
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
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
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
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
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
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
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
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
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
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      expect(await screen.findByText(/delete "Morning run"/i)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
      await vi.waitFor(() => expect(mockDeleteTask).toHaveBeenCalledWith({ id: 'e1' }))
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('does not delete on cancel', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await userEvent.click(await screen.findByRole('button', { name: /cancel/i }))
      expect(mockDeleteTask).not.toHaveBeenCalled()
    })

    it('shows toast on delete error', async () => {
      mockDeleteTask.mockResolvedValueOnce({ error: 'Not found' })
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }))
      await vi.waitFor(() => expect(mockToastError).toHaveBeenCalled())
    })

    it('remounts calendar on cancel (restores optimistic delete)', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
      const initialMountCount = mountCount.value
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await screen.findByText(/delete "Morning run"/i)
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })

    it('does NOT remount calendar on successful delete', async () => {
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
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
      render(<CalendarClient weekStart="2026-05-25" events={events} />)
      const initialMountCount = mountCount.value
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await screen.findByText(/delete "Morning run"/i)
      await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })
  })
})
