import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { CalendarClient } from '@/components/calendar/calendar-client'

const mockRescheduleTask = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'e1' } }))
const mockRecordCompletion = vi.hoisted(() => vi.fn().mockResolvedValue({ data: {} }))
const mockDeleteTask = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { success: true } }))
const mockUpdateTask = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'e1' } }))
const mockUpdateTaskSeries = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'e5' } }))
const mockToastError = vi.hoisted(() => vi.fn())
const mockRefresh = vi.hoisted(() => vi.fn())
const mountCount = vi.hoisted(() => ({ value: 0 }))

// Per-day awake windows in fractional hours, Sun-first (7 entries).
const DAY_WINDOWS = Array.from({ length: 7 }, () => ({ wake: 9, sleep: 17 }))

vi.mock('@/server/actions/consistency', () => ({
  rescheduleTask: mockRescheduleTask,
  recordCompletion: mockRecordCompletion,
}))
vi.mock('@/server/actions/tasks', () => ({
  createTask: vi.fn(),
  updateTask: mockUpdateTask,
  updateTaskSeries: mockUpdateTaskSeries,
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

// The calendar now uses library UI exclusively — no app-owned ActivityFormDialog.

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
  {
    id: 'e5',
    title: 'Daily standup',
    start: '2026-05-29T15:00:00',
    end: '2026-05-29T15:30:00',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 4,
    activityType: 'solo',
    visibility: 'only_me',
    // Recurring: the complete-toggle logs an occurrence via recordCompletion.
    recurrence: 'daily',
  },
  {
    id: 'e6',
    title: 'Weekly review',
    start: '2026-05-29T18:00:00.000Z',
    end: '2026-05-29T19:00:00.000Z',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 2,
    activityType: 'solo',
    visibility: 'only_me',
    // A weekly series carrying a persisted weekday set (S9 seeding fixture).
    recurrence: 'weekly',
    recurrenceDays: ['Mon', 'Wed'] as const,
  },
  {
    id: 'e7',
    title: 'Locked event',
    start: '2026-05-29T20:00:00.000Z',
    end: '2026-05-29T21:00:00.000Z',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
    // A2.4: a row pinned in place — the lock toggle should unlock it.
    locked: true,
  },
]

describe('CalendarClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedProps = {}
    mountCount.value = 0
  })

  it('renders the calendar', () => {
    render(
      <CalendarClient
        weekStart="2026-05-25"
        events={events}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    expect(screen.getByText('Morning run')).toBeInTheDocument()
  })

  // A8.7 (user correction): clicking a calendar event must use the library's
  // own chip popover (details/Edit/Delete) exclusively — the app no longer
  // wires an onEventClick handler, so no app-owned check-in UI can stack on
  // top of the library popover.
  it('clicking an event does not open an app-owned check-in sheet (no onEventClick wired)', async () => {
    render(
      <CalendarClient
        weekStart="2026-05-25"
        events={events}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    await userEvent.click(screen.getByText('Morning run'))
    expect(capturedProps.onEventClick).toBeUndefined()
    expect(screen.queryByTestId('check-in-sheet')).not.toBeInTheDocument()
    expect(screen.queryByTestId('perfect-week')).not.toBeInTheDocument()
  })

  it('passes axe', async () => {
    const { container } = render(
      <CalendarClient
        weekStart="2026-05-25"
        events={events}
        wakeHour={9}
        sleepHour={17}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  describe('move and resize', () => {
    it('calls rescheduleTask with UTC ISO times on move', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
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
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
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
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
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
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
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
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
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
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
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
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
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
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      expect(await screen.findByText(/delete "Morning run"/i)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
      await vi.waitFor(() => expect(mockDeleteTask).toHaveBeenCalledWith({ id: 'e1' }))
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('does not delete on cancel', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await userEvent.click(await screen.findByRole('button', { name: /cancel/i }))
      expect(mockDeleteTask).not.toHaveBeenCalled()
    })

    it('shows toast on delete error', async () => {
      mockDeleteTask.mockResolvedValueOnce({ error: 'Not found' })
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }))
      await vi.waitFor(() => expect(mockToastError).toHaveBeenCalled())
    })

    it('remounts calendar on cancel (restores optimistic delete)', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const initialMountCount = mountCount.value
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await screen.findByText(/delete "Morning run"/i)
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })

    it('does NOT remount calendar on successful delete', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
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
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const initialMountCount = mountCount.value
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await screen.findByText(/delete "Morning run"/i)
      await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })
  })

  // The library chip popover owns the edit form; onEventEdit delivers the
  // FINISHED edit to persist directly (no app-owned dialog).
  describe('edit persistence', () => {
    it('persists the finished edit via updateTask (no app dialog)', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      // Row-shaped edit on a non-recurring event, no frequency set → updateTask.
      // (A frequency here would materialize the series — see the S10 test below.)
      ;(capturedProps.onEventEdit as (e: unknown) => void)({
        id: 'e4',
        title: 'Ship report v2',
        start: '2026-05-29T13:00:00.000Z',
        end: '2026-05-29T14:30:00.000Z',
        color: 'violet',
      })
      await vi.waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'e4',
            title: 'Ship report v2',
            startAt: '2026-05-29T13:00:00.000Z',
            endAt: '2026-05-29T14:30:00.000Z',
            color: 'violet',
            recurrence: null,
            allDay: false,
          }),
        ),
      )
      expect(mockUpdateTaskSeries).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
      expect(screen.queryByTestId('activity-form-dialog')).not.toBeInTheDocument()
    })

    // S10: setting a series frequency on a NON-recurring event (e4) materializes
    // the series — routes to updateTaskSeries, not updateTask.
    it('routes making a non-recurring event recurring to updateTaskSeries', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      ;(capturedProps.onEventEdit as (e: unknown) => void)({
        id: 'e4',
        title: 'Ship report',
        start: '2026-05-29T13:00:00.000Z',
        end: '2026-05-29T14:00:00.000Z',
        recurrenceFrequency: 'weekly',
      })
      await vi.waitFor(() =>
        expect(mockUpdateTaskSeries).toHaveBeenCalledWith({
          taskId: 'e4',
          recurrence: 'weekly',
          recurrenceDays: undefined,
        }),
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })

    // Review fix: goals never materialize into a series. Pre-S10 the
    // wasRecurring gate implicitly protected goals (never recurring → false →
    // updateTask); the !wasRecurring materialize arm must not remove that
    // protection. e3 is a goal.
    it('never routes a goal edited with a series frequency to updateTaskSeries', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      ;(capturedProps.onEventEdit as (e: unknown) => void)({
        id: 'e3',
        title: 'Write book',
        start: '2026-05-29T10:00:00.000Z',
        end: '2026-05-29T11:00:00.000Z',
        recurrenceFrequency: 'weekly',
      })
      await vi.waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'e3', recurrence: 'weekly' }),
        ),
      )
      expect(mockUpdateTaskSeries).not.toHaveBeenCalled()
    })

    // S8: a chip edit that changes the recurrence PATTERN (a new weekday set or
    // a changed frequency on an existing series) routes to updateTaskSeries so
    // the group's future pending rows regenerate; a plain time change keeps
    // updateTask. e5 is a daily series (recurrence 'daily').
    it('routes a changed weekday set to updateTaskSeries with the token array', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      ;(capturedProps.onEventEdit as (e: unknown) => void)({
        id: 'e5',
        title: 'Daily standup',
        start: '2026-05-29T15:00:00.000Z',
        end: '2026-05-29T15:30:00.000Z',
        recurrenceFrequency: 'weekly',
        recurrenceDays: ['Mon', 'Wed'],
      })
      await vi.waitFor(() =>
        expect(mockUpdateTaskSeries).toHaveBeenCalledWith({
          taskId: 'e5',
          recurrence: 'weekly',
          recurrenceDays: ['Mon', 'Wed'],
        }),
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('routes a plain time change on a series to updateTask (not updateTaskSeries)', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      ;(capturedProps.onEventEdit as (e: unknown) => void)({
        id: 'e5',
        title: 'Daily standup',
        start: '2026-05-29T16:00:00.000Z',
        end: '2026-05-29T16:30:00.000Z',
        recurrenceFrequency: 'daily',
      })
      await vi.waitFor(() => expect(mockUpdateTask).toHaveBeenCalled())
      expect(mockUpdateTaskSeries).not.toHaveBeenCalled()
    })

    it('ignores edit of a completed event (no updateTask) but remounts to restore', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const initialMountCount = mountCount.value
      ;(capturedProps.onEventEdit as (e: unknown) => void)({ id: 'e2', title: 'Done event' })
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })

    it('shows a toast and remounts when the edit fails to persist', async () => {
      mockUpdateTask.mockResolvedValueOnce({ error: 'Not found' })
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const initialMountCount = mountCount.value
      ;(capturedProps.onEventEdit as (e: unknown) => void)({
        id: 'e4',
        title: 'Ship report',
        start: '2026-05-29T13:00:00.000Z',
        end: '2026-05-29T14:00:00.000Z',
      })
      await vi.waitFor(() => expect(mockToastError).toHaveBeenCalled())
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })
  })

  // S9 / 0.18.0: seed the chip edit popover's Days picker from the row's
  // persisted recurrenceDays via `seriesDays` (decoupled from the display
  // fan-out field), then route by order-insensitive set equality so a re-emitted
  // unchanged set keeps updateTask and a changed set routes to updateTaskSeries.
  describe('seriesDays seeding + set-equality routing (S9)', () => {
    it('seeds persisted recurrenceDays onto seriesDays, leaving the library recurrenceDays undefined', () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const libEvents = capturedProps.events as ReadonlyArray<{
        id: string
        seriesDays?: readonly string[]
        recurrenceDays?: readonly string[]
      }>
      const series = libEvents.find((e) => e.id === 'e6')!
      expect(series.seriesDays).toEqual(['Mon', 'Wed'])
      expect(series.recurrenceDays).toBeUndefined()
    })

    it('keeps a time-only edit re-emitting the seeded set (reordered) on updateTask', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      ;(capturedProps.onEventEdit as (e: unknown) => void)({
        id: 'e6',
        title: 'Weekly review',
        start: '2026-05-29T20:00:00.000Z',
        end: '2026-05-29T21:00:00.000Z',
        recurrenceFrequency: 'weekly',
        // Same set as persisted (['Mon','Wed']) but reordered.
        recurrenceDays: ['Wed', 'Mon'],
      })
      await vi.waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'e6',
            startAt: '2026-05-29T20:00:00.000Z',
            endAt: '2026-05-29T21:00:00.000Z',
          }),
        ),
      )
      expect(mockUpdateTaskSeries).not.toHaveBeenCalled()
    })

    it('routes a genuinely changed weekday set to updateTaskSeries with the new tokens', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      ;(capturedProps.onEventEdit as (e: unknown) => void)({
        id: 'e6',
        title: 'Weekly review',
        start: '2026-05-29T18:00:00.000Z',
        end: '2026-05-29T19:00:00.000Z',
        recurrenceFrequency: 'weekly',
        recurrenceDays: ['Mon', 'Fri'],
      })
      await vi.waitFor(() =>
        expect(mockUpdateTaskSeries).toHaveBeenCalledWith({
          taskId: 'e6',
          recurrence: 'weekly',
          recurrenceDays: ['Mon', 'Fri'],
        }),
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })
  })

  // A9: per-day windows (fractional hours) + 24h format threaded from prefs.
  describe('per-day windows and 24h pass-through', () => {
    it('forwards dayWindows and use24h to WeekCalendarView', () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={true}
        />,
      )
      expect(capturedProps.dayWindows).toEqual(DAY_WINDOWS)
      expect(capturedProps.use24h).toBe(true)
    })
  })

  // The 0.17.0 completion contract: status→completed, opt-in completable, streak.
  describe('completion contract mapping (0.17.0)', () => {
    it('maps status to completed, marks chips completable, and forwards streak', () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const libEvents = capturedProps.events as ReadonlyArray<{
        id: string
        completed?: boolean
        completable?: boolean
        streak?: number
      }>
      const run = libEvents.find((e) => e.id === 'e1')!
      const done = libEvents.find((e) => e.id === 'e2')!
      expect(run.completed).toBe(false)
      expect(done.completed).toBe(true)
      expect(run.completable).toBe(true)
      expect(run.streak).toBe(3)
    })
  })

  // The chip complete circle fires onEventToggleComplete; persistence mirrors
  // useActivityActions: recurring → recordCompletion, non-recurring → updateTask.
  //
  // The library hands off the TOGGLED event (see WeekCalendarView's
  // handleEventToggleComplete: `{...event, completed: !event.completed}`), so
  // `completed: true` means "complete this now" and `completed: false` means
  // "un-complete this now" — the payloads below make that direction explicit.
  describe('complete-toggle persistence (0.17.0)', () => {
    it('logs a recurring event via recordCompletion', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      ;(capturedProps.onEventToggleComplete as (e: unknown) => void)({
        id: 'e5',
        completed: true,
      })
      await vi.waitFor(() => expect(mockRecordCompletion).toHaveBeenCalledWith({ taskId: 'e5' }))
      expect(mockUpdateTask).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('marks a non-recurring event complete via updateTask', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      ;(capturedProps.onEventToggleComplete as (e: unknown) => void)({
        id: 'e1',
        completed: true,
      })
      await vi.waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith({ id: 'e1', status: 'completed' }),
      )
      expect(mockRecordCompletion).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('toasts and remounts when a recurring completion fails', async () => {
      mockRecordCompletion.mockResolvedValueOnce({ error: 'Unauthorized' })
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const initialMountCount = mountCount.value
      ;(capturedProps.onEventToggleComplete as (e: unknown) => void)({
        id: 'e5',
        completed: true,
      })
      await vi.waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Could not log completion'),
      )
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })

    it('toasts and remounts when a non-recurring completion fails', async () => {
      mockUpdateTask.mockResolvedValueOnce({ error: 'Not found' })
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const initialMountCount = mountCount.value
      ;(capturedProps.onEventToggleComplete as (e: unknown) => void)({
        id: 'e1',
        completed: true,
      })
      await vi.waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Could not mark complete'))
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })

    // Direction bug fix (wave 2.2 Preview Gate): un-completing must set status
    // 'pending' via updateTask for BOTH recurring and non-recurring events —
    // there is no undo-completion primitive (recordCompletion only marks a
    // task done); streak values are derived on read, so un-completing recomputes.
    it('marks a recurring event incomplete via updateTask status pending (not recordCompletion)', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      ;(capturedProps.onEventToggleComplete as (e: unknown) => void)({
        id: 'e5',
        completed: false,
      })
      await vi.waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith({ id: 'e5', status: 'pending' }),
      )
      expect(mockRecordCompletion).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('marks a non-recurring event incomplete via updateTask status pending', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      ;(capturedProps.onEventToggleComplete as (e: unknown) => void)({
        id: 'e1',
        completed: false,
      })
      await vi.waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith({ id: 'e1', status: 'pending' }),
      )
      expect(mockRecordCompletion).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('toasts and remounts when marking incomplete fails to persist', async () => {
      mockUpdateTask.mockResolvedValueOnce({ error: 'Not found' })
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const initialMountCount = mountCount.value
      ;(capturedProps.onEventToggleComplete as (e: unknown) => void)({
        id: 'e1',
        completed: false,
      })
      await vi.waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Could not mark incomplete'),
      )
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })
  })

  // ── lock toggle (A2.4) ──────────────────────────────────────────────────
  //
  // The chip's lock affordance bubbles up as onEventToggleLock. The app flips the
  // row's PERSISTED locked state (server truth, not the optimistic library event) and
  // persists it via updateTask({ id, locked }) — the only field it sends. Lock
  // never touches complete-toggle or series-edit routing.
  describe('lock toggle (A2.4)', () => {
    it('seeds the persisted locked flag onto the library event', () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const libEvents = capturedProps.events as ReadonlyArray<{ id: string; locked?: boolean }>
      expect(libEvents.find((e) => e.id === 'e7')!.locked).toBe(true)
      // An unlocked row seeds no truthy locked flag.
      expect(libEvents.find((e) => e.id === 'e1')!.locked ?? false).toBe(false)
    })

    it('locks an unlocked event via updateTask with exactly { id, locked: true }', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      ;(capturedProps.onEventToggleLock as (e: unknown) => void)({ id: 'e1' })
      await vi.waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith({ id: 'e1', locked: true }),
      )
      // Lock is not a series-shaped or completion change.
      expect(mockUpdateTaskSeries).not.toHaveBeenCalled()
      expect(mockRecordCompletion).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('unlocks a locked event via updateTask with exactly { id, locked: false }', async () => {
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      ;(capturedProps.onEventToggleLock as (e: unknown) => void)({ id: 'e7' })
      await vi.waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith({ id: 'e7', locked: false }),
      )
      expect(mockUpdateTaskSeries).not.toHaveBeenCalled()
    })

    it('toasts and remounts when the lock update fails to persist', async () => {
      mockUpdateTask.mockResolvedValueOnce({ error: 'Not found' })
      render(
        <CalendarClient
          weekStart="2026-05-25"
          events={events}
          wakeHour={9}
          sleepHour={17}
          dayWindows={DAY_WINDOWS}
          use24h={false}
        />,
      )
      const initialMountCount = mountCount.value
      ;(capturedProps.onEventToggleLock as (e: unknown) => void)({ id: 'e1' })
      await vi.waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Could not update lock — calendar restored'),
      )
      await vi.waitFor(() => expect(mountCount.value).toBe(initialMountCount + 1))
    })
  })
})
