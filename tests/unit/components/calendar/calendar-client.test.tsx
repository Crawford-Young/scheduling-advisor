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
const mockUpdateSeries = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'e5' } }))
const mockDeleteSeries = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { success: true } }))
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
  deleteTask: mockDeleteTask,
}))
vi.mock('@/server/actions/series-mutations', () => ({
  updateSeries: mockUpdateSeries,
  deleteSeries: mockDeleteSeries,
}))
const mockReplace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: mockReplace }),
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
    recurrenceGroupId: null,
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
    recurrenceGroupId: null,
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
    recurrenceGroupId: null,
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
    recurrenceGroupId: null,
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
    // Ungrouped (wave 2.6 S4): an already-recurring row not yet materialized
    // into a group — edits asserting a series frequency route through the
    // becomingSeries updateSeries path, not updateTask.
    recurrence: 'daily',
    recurrenceGroupId: null,
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
    // Grouped (wave 2.6 S4): every edit on this row routes to updateSeries.
    recurrence: 'weekly',
    recurrenceDays: ['Mon', 'Wed'] as const,
    recurrenceGroupId: 'grp-series',
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
    recurrenceGroupId: null,
  },
  // Grouped (wave 2.6 S4), no persisted weekday set — plain field edits,
  // yearly-frequency edits, same-dow drags, and complete/lock toggles all
  // exercise the grouped updateSeries path from this fixture.
  {
    id: 'e8',
    title: 'Grouped event',
    // 2026-01-06 is a Tuesday.
    start: '2026-01-06T09:00:00.000Z',
    end: '2026-01-06T10:00:00.000Z',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
    recurrence: 'weekly',
    recurrenceGroupId: 'grp-1',
  },
  // Grouped weekly-days fixture — a cross-dow drag rewrites the persisted set.
  {
    id: 'e9',
    title: 'Grouped days event',
    // 2026-01-05 is a Monday.
    start: '2026-01-05T09:00:00.000Z',
    end: '2026-01-05T10:00:00.000Z',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
    recurrence: 'weekly',
    recurrenceDays: ['Mon', 'Wed'] as const,
    recurrenceGroupId: 'grp-2',
  },
  // Grouped interval fixture with NO persisted weekday set — a cross-dow drag
  // has no day set to rewrite, so it stays time-of-day-only.
  {
    id: 'e10',
    title: 'Grouped interval event',
    // 2026-01-05 is a Monday.
    start: '2026-01-05T09:00:00.000Z',
    end: '2026-01-05T10:00:00.000Z',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
    recurrence: 'daily',
    recurrenceGroupId: 'grp-3',
  },
  // S14: a sibling of e8 in group 'grp-1' — proves the optimistic "Entire
  // series" overlay hides every occurrence of the group, not just the clicked one.
  {
    id: 'e11',
    title: 'Grouped event sibling',
    start: '2026-01-13T09:00:00.000Z',
    end: '2026-01-13T10:00:00.000Z',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
    recurrence: 'weekly',
    recurrenceGroupId: 'grp-1',
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

    it('moves a completed event via rescheduleTask like any other event (no completed guard)', async () => {
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
      await vi.waitFor(() => {
        expect(mockRescheduleTask).toHaveBeenCalledWith({
          taskId: 'e2',
          newStartAt: new Date('2026-05-29T11:00:00').toISOString(),
          newEndAt: new Date('2026-05-29T12:00:00').toISOString(),
        })
      })
      expect(mockRefresh).toHaveBeenCalled()
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

    it('bumps the resync token in place after a completed-event move settles (no remount)', async () => {
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
      const initialToken = capturedProps.resyncToken as number
      const onEventMove = capturedProps.onEventMove as (e: unknown) => void
      onEventMove({
        id: 'e2',
        title: 'Done event',
        start: '2026-05-29T11:00:00',
        end: '2026-05-29T12:00:00',
      })
      await vi.waitFor(() => expect(mockRefresh).toHaveBeenCalled())
      await vi.waitFor(() => expect(capturedProps.resyncToken).toBe(initialToken + 1))
      // The library re-seeds via the token — never remounted.
      expect(mountCount.value).toBe(initialMountCount)
    })

    it('bumps the resync token in place on reschedule error (no remount)', async () => {
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
      const initialToken = capturedProps.resyncToken as number
      const onEventMove = capturedProps.onEventMove as (e: unknown) => void
      onEventMove({
        id: 'e1',
        title: 'Morning run',
        start: '2026-05-29T09:00:00',
        end: '2026-05-29T10:00:00',
      })
      await vi.waitFor(() => expect(capturedProps.resyncToken).toBe(initialToken + 1))
      expect(mockRefresh).toHaveBeenCalled()
      expect(mountCount.value).toBe(initialMountCount)
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

    it('bumps the resync token in place on cancel (restores optimistic delete, no refresh)', async () => {
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
      const initialToken = capturedProps.resyncToken as number
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await screen.findByText(/delete "Morning run"/i)
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
      await vi.waitFor(() => expect(capturedProps.resyncToken).toBe(initialToken + 1))
      expect(mockRefresh).not.toHaveBeenCalled()
      expect(mountCount.value).toBe(initialMountCount)
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

    it('bumps the resync token in place on delete error (no remount)', async () => {
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
      const initialToken = capturedProps.resyncToken as number
      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e1', title: 'Morning run' })
      await screen.findByText(/delete "Morning run"/i)
      await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
      await vi.waitFor(() => expect(capturedProps.resyncToken).toBe(initialToken + 1))
      expect(mockRefresh).toHaveBeenCalled()
      expect(mountCount.value).toBe(initialMountCount)
    })

    // S11: a grouped occurrence (e8, recurrenceGroupId 'grp-1') offers a 3-way
    // scope choice instead of the plain 2-way confirm.
    it('offers a 3-way scope choice for a grouped occurrence', async () => {
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
      onEventDelete({ id: 'e8', title: 'Grouped event' })
      expect(await screen.findByText(/delete "Grouped event"/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^this event only$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^entire series$/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    })

    it('"This event only" deletes the single occurrence via deleteTask', async () => {
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
      onEventDelete({ id: 'e8', title: 'Grouped event' })
      await userEvent.click(await screen.findByRole('button', { name: /^this event only$/i }))
      await vi.waitFor(() => expect(mockDeleteTask).toHaveBeenCalledWith({ id: 'e8' }))
      expect(mockDeleteSeries).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('"Entire series" deletes the whole group via deleteSeries', async () => {
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
      onEventDelete({ id: 'e8', title: 'Grouped event' })
      await userEvent.click(await screen.findByRole('button', { name: /^entire series$/i }))
      await vi.waitFor(() => expect(mockDeleteSeries).toHaveBeenCalledWith({ groupId: 'grp-1' }))
      expect(mockDeleteTask).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('shows toast on "Entire series" delete error', async () => {
      mockDeleteSeries.mockResolvedValueOnce({ error: 'Not found' })
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
      onEventDelete({ id: 'e8', title: 'Grouped event' })
      await userEvent.click(await screen.findByRole('button', { name: /^entire series$/i }))
      await vi.waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Could not delete series'))
    })

    // S14: confirming "Entire series" hides every occurrence of the group
    // instantly (client-side overlay), before deleteSeries resolves.
    it('optimistically hides the whole group on confirm, before deleteSeries resolves', async () => {
      let resolveDelete!: (value: unknown) => void
      mockDeleteSeries.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDelete = resolve
        }),
      )
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
      // Both e8 and its sibling e11 belong to grp-1 and render before the delete.
      expect(screen.getByText('Grouped event')).toBeInTheDocument()
      expect(screen.getByText('Grouped event sibling')).toBeInTheDocument()

      const onEventDelete = capturedProps.onEventDelete as (e: unknown) => void
      onEventDelete({ id: 'e8', title: 'Grouped event' })
      await userEvent.click(await screen.findByRole('button', { name: /^entire series$/i }))

      // In-flight: both grouped chips vanish; an ungrouped chip stays.
      await vi.waitFor(() => expect(screen.queryByText('Grouped event')).not.toBeInTheDocument())
      expect(screen.queryByText('Grouped event sibling')).not.toBeInTheDocument()
      expect(screen.getByText('Morning run')).toBeInTheDocument()

      resolveDelete({ data: { success: true } })
    })

    it('reveals the whole group again when "Entire series" fails', async () => {
      mockDeleteSeries.mockResolvedValueOnce({ error: 'Not found' })
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
      onEventDelete({ id: 'e8', title: 'Grouped event' })
      await userEvent.click(await screen.findByRole('button', { name: /^entire series$/i }))
      await vi.waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Could not delete series'))
      expect(screen.getByText('Grouped event')).toBeInTheDocument()
      expect(screen.getByText('Grouped event sibling')).toBeInTheDocument()
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
      expect(mockUpdateSeries).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
      expect(screen.queryByTestId('activity-form-dialog')).not.toBeInTheDocument()
    })

    // S10: setting a series frequency on a NON-recurring event (e4) materializes
    // the series — routes to updateSeries, not updateTask.
    it('routes making a non-recurring event recurring to updateSeries', async () => {
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
        expect(mockUpdateSeries).toHaveBeenCalledWith({
          taskId: 'e4',
          title: 'Ship report',
          startAt: '2026-05-29T13:00:00.000Z',
          endAt: '2026-05-29T14:00:00.000Z',
          color: null,
          location: null,
          description: null,
          allDay: false,
          recurrence: 'weekly',
          recurrenceDays: undefined,
          timeZone: expect.any(String),
        }),
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })

    // Review fix: goals never materialize into a series. Pre-S10 the
    // wasRecurring gate implicitly protected goals (never recurring → false →
    // updateTask); the !wasRecurring materialize arm must not remove that
    // protection. e3 is a goal.
    it('never routes a goal edited with a series frequency to updateSeries', async () => {
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
      expect(mockUpdateSeries).not.toHaveBeenCalled()
    })

    // Wave 2.6 S4: e5 is UNGROUPED but already stores recurrence 'daily' — ANY
    // edit that asserts a series frequency on an ungrouped row is a
    // becomingSeries materialize/join, routing to updateSeries regardless of
    // whether a weekday set is also emitted or the frequency is unchanged.
    // The old client-side sameDaySet/daysChanged/recurrenceChanged predicate
    // (S8/S9) is gone — the server now decides field vs pattern.
    it('routes an ungrouped edit with a changed weekday set to updateSeries with the token array', async () => {
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
        expect(mockUpdateSeries).toHaveBeenCalledWith({
          taskId: 'e5',
          title: 'Daily standup',
          startAt: '2026-05-29T15:00:00.000Z',
          endAt: '2026-05-29T15:30:00.000Z',
          color: null,
          location: null,
          description: null,
          allDay: false,
          recurrence: 'weekly',
          recurrenceDays: ['Mon', 'Wed'],
          timeZone: expect.any(String),
        }),
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('routes an ungrouped edit re-asserting the SAME series frequency to updateSeries (not updateTask)', async () => {
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
      await vi.waitFor(() =>
        expect(mockUpdateSeries).toHaveBeenCalledWith({
          taskId: 'e5',
          title: 'Daily standup',
          startAt: '2026-05-29T16:00:00.000Z',
          endAt: '2026-05-29T16:30:00.000Z',
          color: null,
          location: null,
          description: null,
          allDay: false,
          recurrence: 'daily',
          recurrenceDays: undefined,
          timeZone: expect.any(String),
        }),
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })

    // Grouped row (wave 2.6 S4): e8 has recurrenceGroupId set — ANY edit
    // (field-only here, no frequency emitted) routes to updateSeries.
    it('routes a GROUPED row plain field edit to updateSeries', async () => {
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
        id: 'e8',
        title: 'Grouped edited',
        start: '2026-01-06T09:30:00.000Z',
        end: '2026-01-06T10:30:00.000Z',
        color: 'violet',
        location: 'Office',
        description: 'standup',
        allDay: true,
      })
      await vi.waitFor(() =>
        expect(mockUpdateSeries).toHaveBeenCalledWith({
          taskId: 'e8',
          title: 'Grouped edited',
          startAt: '2026-01-06T09:30:00.000Z',
          endAt: '2026-01-06T10:30:00.000Z',
          color: 'violet',
          location: 'Office',
          description: 'standup',
          allDay: true,
          recurrence: null,
          recurrenceDays: undefined,
          timeZone: expect.any(String),
        }),
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })

    // A non-series frequency ('yearly') on a grouped row maps recurrence to
    // null — the server, not the client, decides field vs pattern.
    it('maps a non-series frequency to recurrence:null on a GROUPED row edit', async () => {
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
        id: 'e8',
        title: 'Grouped event',
        start: '2026-01-06T09:00:00.000Z',
        end: '2026-01-06T10:00:00.000Z',
        recurrenceFrequency: 'yearly',
      })
      await vi.waitFor(() =>
        expect(mockUpdateSeries).toHaveBeenCalledWith(
          expect.objectContaining({ taskId: 'e8', recurrence: null }),
        ),
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })

    it('persists an edit of a completed event via updateTask like any other event (no completed guard)', async () => {
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
        id: 'e2',
        title: 'Done event v2',
        start: '2026-05-29T09:00:00.000Z',
        end: '2026-05-29T10:30:00.000Z',
      })
      await vi.waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'e2',
            title: 'Done event v2',
            startAt: '2026-05-29T09:00:00.000Z',
            endAt: '2026-05-29T10:30:00.000Z',
          }),
        ),
      )
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('shows a toast and resyncs in place when the edit fails to persist', async () => {
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
      const initialToken = capturedProps.resyncToken as number
      ;(capturedProps.onEventEdit as (e: unknown) => void)({
        id: 'e4',
        title: 'Ship report',
        start: '2026-05-29T13:00:00.000Z',
        end: '2026-05-29T14:00:00.000Z',
      })
      await vi.waitFor(() => expect(mockToastError).toHaveBeenCalled())
      await vi.waitFor(() => expect(capturedProps.resyncToken).toBe(initialToken + 1))
      expect(mockRefresh).toHaveBeenCalled()
      expect(mountCount.value).toBe(initialMountCount)
    })
  })

  // S9 / 0.18.0: seed the chip edit popover's Days picker from the row's
  // persisted recurrenceDays via `seriesDays` (decoupled from the display
  // fan-out field), then route by order-insensitive set equality so a re-emitted
  // unchanged set keeps updateTask and a changed set routes to updateSeries.
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

    // e6 is GROUPED (wave 2.6 S4) — every edit routes to updateSeries
    // regardless of whether the re-emitted day set changed. The old
    // client-side set-equality routing predicate is gone.
    it('routes a grouped edit re-emitting the seeded set (reordered, same set) to updateSeries', async () => {
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
        expect(mockUpdateSeries).toHaveBeenCalledWith({
          taskId: 'e6',
          title: 'Weekly review',
          startAt: '2026-05-29T20:00:00.000Z',
          endAt: '2026-05-29T21:00:00.000Z',
          color: null,
          location: null,
          description: null,
          allDay: false,
          recurrence: 'weekly',
          recurrenceDays: ['Wed', 'Mon'],
          timeZone: expect.any(String),
        }),
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })

    it('routes a grouped edit with a genuinely changed weekday set to updateSeries with the new tokens', async () => {
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
        expect(mockUpdateSeries).toHaveBeenCalledWith(
          expect.objectContaining({
            taskId: 'e6',
            recurrence: 'weekly',
            recurrenceDays: ['Mon', 'Fri'],
          }),
        ),
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })
  })

  // ── drag/time-change routing (wave 2.6 S4) ──────────────────────────────
  //
  // Ungrouped rows keep the single-row rescheduleTask path (item 8). Grouped
  // rows route through updateSeries: a same-weekday drag is a time-of-day-only
  // rewrite (item 5); a cross-weekday drag on a row with a persisted weekday
  // set rewrites that set — old weekday out, new weekday in (item 6); a
  // cross-weekday drag with NO day set (daily/monthly interval series) has no
  // set to rewrite, so it also stays time-of-day-only (item 7).
  describe('grouped drag routing (wave 2.6 S4)', () => {
    it('routes a same-weekday drag on a grouped row to a time-only updateSeries payload (item 5)', async () => {
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
        id: 'e8',
        title: 'Grouped event',
        start: '2026-01-06T14:00:00.000Z',
        end: '2026-01-06T15:00:00.000Z',
      })
      await vi.waitFor(() =>
        expect(mockUpdateSeries).toHaveBeenCalledWith({
          taskId: 'e8',
          startAt: '2026-01-06T14:00:00.000Z',
          endAt: '2026-01-06T15:00:00.000Z',
          timeZone: expect.any(String),
        }),
      )
      expect(mockRescheduleTask).not.toHaveBeenCalled()
    })

    it('rewrites the persisted weekday set on a cross-weekday drag (Mon out, Fri in) (item 6)', async () => {
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
      // 2026-01-05 (Mon) → 2026-01-09 (Fri).
      onEventMove({
        id: 'e9',
        title: 'Grouped days event',
        start: '2026-01-09T09:00:00.000Z',
        end: '2026-01-09T10:00:00.000Z',
      })
      await vi.waitFor(() =>
        expect(mockUpdateSeries).toHaveBeenCalledWith({
          taskId: 'e9',
          startAt: '2026-01-09T09:00:00.000Z',
          endAt: '2026-01-09T10:00:00.000Z',
          recurrence: 'weekly',
          recurrenceDays: ['Wed', 'Fri'],
          timeZone: expect.any(String),
        }),
      )
    })

    it('stays time-of-day-only on a cross-weekday drag with no persisted day set (item 7)', async () => {
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
      // 2026-01-05 (Mon) → 2026-01-08 (Thu).
      onEventMove({
        id: 'e10',
        title: 'Grouped interval event',
        start: '2026-01-08T09:00:00.000Z',
        end: '2026-01-08T10:00:00.000Z',
      })
      await vi.waitFor(() =>
        expect(mockUpdateSeries).toHaveBeenCalledWith({
          taskId: 'e10',
          startAt: '2026-01-08T09:00:00.000Z',
          endAt: '2026-01-08T10:00:00.000Z',
          timeZone: expect.any(String),
        }),
      )
    })

    it('routes an ungrouped drag to rescheduleTask, never updateSeries (item 8)', async () => {
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
      await vi.waitFor(() => expect(mockRescheduleTask).toHaveBeenCalled())
      expect(mockUpdateSeries).not.toHaveBeenCalled()
    })
  })

  // ── complete/lock toggle stay per-occurrence on a grouped row (item 9) ───
  describe('complete/lock toggle on a grouped row (wave 2.6 S4, item 9)', () => {
    it('routes a complete toggle on a grouped (recurring) row through recordCompletion, never updateSeries', async () => {
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
        id: 'e8',
        completed: true,
      })
      await vi.waitFor(() => expect(mockRecordCompletion).toHaveBeenCalledWith({ taskId: 'e8' }))
      expect(mockUpdateSeries).not.toHaveBeenCalled()
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })

    it('routes a lock toggle on a grouped row through updateTask, never updateSeries', async () => {
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
      ;(capturedProps.onEventToggleLock as (e: unknown) => void)({ id: 'e8' })
      await vi.waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith({ id: 'e8', locked: true }),
      )
      expect(mockUpdateSeries).not.toHaveBeenCalled()
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

    it('toasts and resyncs in place when a recurring completion fails', async () => {
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
      const initialToken = capturedProps.resyncToken as number
      ;(capturedProps.onEventToggleComplete as (e: unknown) => void)({
        id: 'e5',
        completed: true,
      })
      await vi.waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Could not log completion'),
      )
      await vi.waitFor(() => expect(capturedProps.resyncToken).toBe(initialToken + 1))
      expect(mountCount.value).toBe(initialMountCount)
    })

    it('toasts and resyncs in place when a non-recurring completion fails', async () => {
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
      const initialToken = capturedProps.resyncToken as number
      ;(capturedProps.onEventToggleComplete as (e: unknown) => void)({
        id: 'e1',
        completed: true,
      })
      await vi.waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Could not mark complete'))
      await vi.waitFor(() => expect(capturedProps.resyncToken).toBe(initialToken + 1))
      expect(mountCount.value).toBe(initialMountCount)
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

    it('toasts and resyncs in place when marking incomplete fails to persist', async () => {
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
      const initialToken = capturedProps.resyncToken as number
      ;(capturedProps.onEventToggleComplete as (e: unknown) => void)({
        id: 'e1',
        completed: false,
      })
      await vi.waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Could not mark incomplete'),
      )
      await vi.waitFor(() => expect(capturedProps.resyncToken).toBe(initialToken + 1))
      expect(mountCount.value).toBe(initialMountCount)
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
      expect(mockUpdateSeries).not.toHaveBeenCalled()
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
      expect(mockUpdateSeries).not.toHaveBeenCalled()
    })

    it('toasts and resyncs in place when the lock update fails to persist', async () => {
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
      const initialToken = capturedProps.resyncToken as number
      ;(capturedProps.onEventToggleLock as (e: unknown) => void)({ id: 'e1' })
      await vi.waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Could not update lock — calendar restored'),
      )
      await vi.waitFor(() => expect(capturedProps.resyncToken).toBe(initialToken + 1))
      expect(mountCount.value).toBe(initialMountCount)
    })
  })
})
